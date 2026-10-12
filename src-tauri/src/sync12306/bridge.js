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

  function apiMessage(json) {
    if (!json || typeof json !== "object") return "订单接口没有返回数据";
    var msg = "";
    if (Array.isArray(json.messages)) msg = json.messages.filter(Boolean).join("；");
    else if (typeof json.messages === "string") msg = json.messages;
    if (json.status === false) return msg || "查询订单失败";
    if (msg && /登录|登陆/.test(msg)) return msg;
    return "";
  }

  function post(path, data) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error("请求超时"));
      }, 20000);
      fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
        },
        body: form(data),
        credentials: "include",
      }).then(
        function (res) {
          clearTimeout(timer);
          res.text().then(function (text) {
            try {
              resolve(JSON.parse(text));
            } catch (err) {
              reject(new Error("接口返回非 JSON，可能尚未登录或页面被拦截"));
            }
          }, reject);
        },
        function (err) {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  function ymd(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function addDays(date, days) {
    var next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
  }

  function today() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function flatten(json) {
    var data = json && json.data;
    if (!data || typeof data !== "object") return { tickets: [], orderCount: 0, total: null };
    var orders = data.OrderDTODataList || data.orderDTODataList || data.orderDBList || data.orderList || [];
    if (!Array.isArray(orders)) orders = [];
    var totalRaw = data.order_total_number != null ? data.order_total_number : data.orderTotalNumber;
    var totalNum = Number(totalRaw);
    var total = Number.isFinite(totalNum) ? totalNum : null;
    var out = [];
    orders.forEach(function (order) {
      var list = order && (order.tickets || order.myTicketList || order.ticketList);
      if (!Array.isArray(list) || list.length === 0) {
        if (
          order &&
          (order.stationTrainDTO || order.from_station_name || order.station_train_code || order.train_code)
        ) {
          list = [order];
        } else {
          list = [];
        }
      }
      list.forEach(function (ticket) {
        var copy = Object.assign({}, ticket);
        copy.sequence_no = copy.sequence_no || (order && (order.sequence_no || order.sequenceNo));
        copy.order_date = copy.order_date || (order && order.order_date);
        if (!copy.str_ticket_price_page && order && order.str_ticket_price_page) {
          copy.str_ticket_price_page = order.str_ticket_price_page;
        }
        out.push(copy);
      });
    });
    return { tickets: out, orderCount: orders.length, total: total };
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /** 与订单页一致：pageIndex 从 0 开始，每页 8 个订单。 */
  async function queryOrders(where, queryType, start, end) {
    var pageIndex = 0;
    var all = [];
    var seen = "";
    while (pageIndex < 40) {
      var json = await post("/otn/queryOrder/queryMyOrder", {
        come_from_flag: "my_order",
        pageSize: "8",
        pageIndex: String(pageIndex),
        query_where: where,
        queryType: String(queryType),
        queryStartDate: ymd(start),
        queryEndDate: ymd(end),
        sequeue_train_name: "",
      });
      var failure = apiMessage(json);
      if (failure) throw new Error(failure);
      var batch = flatten(json);
      var marker = "";
      if (batch.tickets[0]) {
        marker = [
          batch.tickets[0].sequence_no || "",
          batch.tickets[0].coach_no || "",
          batch.tickets[0].seat_name || "",
          batch.tickets[0].start_train_date_page || batch.tickets[0].train_date || "",
        ].join("|");
      }
      if (marker && marker === seen) break;
      seen = marker;
      all = all.concat(batch.tickets);
      if (batch.orderCount < 8) break;
      if (batch.total != null && (pageIndex + 1) * 8 >= batch.total) break;
      pageIndex += 1;
      await sleep(200);
    }
    return all;
  }

  async function readIncomplete() {
    var json = await post("/otn/queryOrder/queryMyOrderNoComplete", { _json_att: "" });
    if (apiMessage(json)) return [];
    return flatten(json).tickets;
  }

  /**
   * 订单页（train_order.html）的查询条件：
   * 未出行按订票日期约近 30 天，再按乘车日期向后约 30 天；
   * 历史订单按订票日期回溯，单次不超过页面允许的约 30 天。超出保存期限时接口会报错，到此为止，已读到的票保留。
   */
  async function collectTickets(onProgress) {
    var tickets = [];
    var errors = [];
    var sawOrderQuery = false;
    var day = today();

    function remember(err) {
      errors.push(err && err.message ? err.message : String(err));
    }

    onProgress("正在读取未完成订单…");
    try {
      tickets = tickets.concat(await readIncomplete());
    } catch (_err) {
      /* 没有未完成订单时接口可能报错 */
    }

    onProgress("正在读取未出行订单…");
    try {
      tickets = tickets.concat(await queryOrders("G", "1", addDays(day, -29), day));
      sawOrderQuery = true;
    } catch (err) {
      remember(err);
    }
    try {
      tickets = tickets.concat(await queryOrders("G", "2", day, addDays(day, 29)));
      sawOrderQuery = true;
    } catch (err) {
      remember(err);
    }

    var end = addDays(day, -1);
    var emptyStreak = 0;
    for (var i = 0; i < 24; i++) {
      var start = addDays(end, -29);
      onProgress("正在读取历史订单 " + ymd(start) + " ~ " + ymd(end) + "…");
      try {
        var batch = await queryOrders("H", "1", start, end);
        sawOrderQuery = true;
        if (batch.length === 0) {
          emptyStreak += 1;
          if (emptyStreak >= 2) break;
        } else {
          emptyStreak = 0;
          tickets = tickets.concat(batch);
        }
      } catch (err) {
        remember(err);
        break;
      }
      end = addDays(start, -1);
      await sleep(250);
    }

    if (!sawOrderQuery && errors.length > 0) {
      throw new Error(errors[0]);
    }
    return tickets;
  }

  function loggedInFrom(user, conf) {
    if (user && user.data && user.data.flag) return true;
    var flag = conf && conf.data && conf.data.is_login;
    return flag === "Y" || flag === true;
  }

  window.__rfBridge = {
    startLoginCheck: function () {
      var current = window.__rfLogin;
      if (current && current.running && Date.now() - current.started < 20000) {
        return { state: "running" };
      }
      var job = { running: true, out: null, started: Date.now() };
      window.__rfLogin = job;
      Promise.all([
        post("/otn/login/checkUser", { _json_att: "" }).catch(function () {
          return null;
        }),
        post("/otn/login/conf", { _json_att: "" }).catch(function () {
          return null;
        }),
      ])
        .then(function (pair) {
          if (window.__rfLogin !== job) return;
          job.out = loggedInFrom(pair[0], pair[1]);
        })
        .catch(function () {
          if (window.__rfLogin !== job) return;
          job.out = false;
        })
        .then(function () {
          if (window.__rfLogin !== job) return;
          job.running = false;
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
      var current = window.__rfJob;
      if (current && current.running && Date.now() - current.started < 300000) {
        return { state: "running" };
      }
      var job = { running: true, progress: "开始读取订单…", out: null, started: Date.now() };
      window.__rfJob = job;
      collectTickets(function (text) {
        if (window.__rfJob === job) job.progress = text;
      })
        .then(function (tickets) {
          if (window.__rfJob !== job) return;
          job.out = { ok: true, tickets: tickets };
        })
        .catch(function (err) {
          if (window.__rfJob !== job) return;
          job.out = { ok: false, error: String(err && err.message ? err.message : err) };
        })
        .then(function () {
          if (window.__rfJob !== job) return;
          job.running = false;
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
