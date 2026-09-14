/* 注入到 kyfw.12306.cn 页面，只负责探测登录并拉取订单。账号密码不回传。 */
(function () {
  if (window.__rfBridge) return;

  function form(data) {
    var parts = [];
    Object.keys(data).forEach(function (key) {
      parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(data[key] == null ? "" : data[key]));
    });
    return parts.join("&");
  }

  function post(path, data) {
    return fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
        Referer: location.href,
      },
      body: form(data),
      credentials: "include",
    }).then(function (res) {
      return res.text().then(function (text) {
        try {
          return JSON.parse(text);
        } catch (err) {
          throw new Error("接口返回非 JSON，可能尚未登录或页面被拦截");
        }
      });
    });
  }

  function ymd(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function addDays(date, days) {
    var next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
  }

  function flatten(json) {
    var data = json && json.data;
    if (!data) return [];
    var orders =
      data.OrderDTODataList ||
      data.orderDTODataList ||
      data.orderDBList ||
      data.orderList ||
      [];
    if (!Array.isArray(orders)) orders = [];
    var out = [];
    orders.forEach(function (order) {
      var tickets = (order && (order.tickets || order.myTicketList || order.ticketList)) || [];
      if (!Array.isArray(tickets)) tickets = [];
      tickets.forEach(function (ticket) {
        var copy = Object.assign({}, ticket);
        copy.sequence_no = copy.sequence_no || (order && (order.sequence_no || order.sequenceNo));
        copy.order_date = copy.order_date || (order && order.order_date);
        copy.ticket_price =
          copy.ticket_price ||
          copy.ticketPrice ||
          copy.str_ticket_price_page ||
          copy.ticket_price_page ||
          (order && order.ticket_price);
        out.push(copy);
      });
    });
    return out;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function paginate(where, extra) {
    var pageIndex = 0;
    var all = [];
    while (pageIndex < 40) {
      var body = Object.assign(
        {
          come_from_flag: "my_order",
          pageSize: "8",
          pageIndex: String(pageIndex),
          query_where: where,
          sequeue_train_name: "",
        },
        extra || {},
      );
      var json = await post("/otn/queryOrder/queryMyOrder", body);
      if (json && json.status === false) {
        var msg = Array.isArray(json.messages) ? json.messages.join("；") : json.messages;
        throw new Error(msg || "查询订单失败");
      }
      var batch = flatten(json);
      all = all.concat(batch);
      if (batch.length < 8) break;
      pageIndex += 1;
      await sleep(200);
    }
    return all;
  }

  async function collectTickets(onProgress) {
    onProgress("正在读取未完成订单…");
    var tickets = [];
    try {
      var incomplete = await post("/otn/queryOrder/queryMyOrderNoComplete", { _json_att: "" });
      tickets = tickets.concat(flatten(incomplete));
    } catch (_err) {
      /* 无未完成订单时接口可能报错，忽略 */
    }

    onProgress("正在读取未出行订单…");
    tickets = tickets.concat(await paginate("G"));

    var end = new Date();
    for (var i = 0; i < 24; i++) {
      var start = addDays(end, -29);
      onProgress("正在读取历史订单 " + ymd(start) + " ~ " + ymd(end) + "…");
      tickets = tickets.concat(
        await paginate("H", {
          queryType: "2",
          queryStartDate: ymd(start),
          queryEndDate: ymd(end),
        }),
      );
      end = addDays(start, -1);
      await sleep(250);
    }
    return tickets;
  }

  window.__rfBridge = {
    startLoginCheck: function () {
      if (window.__rfLogin && window.__rfLogin.running) return { state: "running" };
      window.__rfLogin = { running: true, out: null };
      post("/otn/login/checkUser", { _json_att: "" })
        .then(function (json) {
          window.__rfLogin.out = !!(json && json.data && json.data.flag);
        })
        .catch(function () {
          window.__rfLogin.out = false;
        })
        .then(function () {
          window.__rfLogin.running = false;
        });
      return { state: "started" };
    },
    loginStatus: function () {
      var job = window.__rfLogin;
      if (!job) return { state: "idle" };
      if (job.running) return { state: "running" };
      return { state: "done", loggedIn: !!job.out };
    },
    startCollect: function () {
      if (window.__rfJob && window.__rfJob.running) return { state: "running" };
      window.__rfJob = { running: true, progress: "开始读取订单…", out: null };
      collectTickets(function (text) {
        if (window.__rfJob) window.__rfJob.progress = text;
      })
        .then(function (tickets) {
          window.__rfJob.out = { ok: true, tickets: tickets };
        })
        .catch(function (err) {
          window.__rfJob.out = { ok: false, error: String(err && err.message ? err.message : err) };
        })
        .then(function () {
          window.__rfJob.running = false;
        });
      return { state: "started" };
    },
    collectStatus: function () {
      var job = window.__rfJob;
      if (!job) return { state: "idle" };
      if (job.running) return { state: "running", progress: job.progress || "" };
      return { state: "done", result: job.out };
    },
  };
})();
