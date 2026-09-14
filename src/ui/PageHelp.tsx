import { useId } from "react";

type Props = {
  text: string;
};

export function PageHelp({ text }: Props) {
  const id = useId();
  return (
    <span className="page-help">
      <button type="button" className="page-help-mark" aria-describedby={id} aria-label="说明">
        ?
      </button>
      <span className="page-help-tip" role="tooltip" id={id}>
        {text}
      </span>
    </span>
  );
}
