import { durationSegments, formatDuration } from "../domain/duration";

type Props = {
  minutes: number | null;
};

export function DurationValue({ minutes }: Props) {
  if (minutes == null) {
    return <div className="value">—</div>;
  }
  return (
    <div className="duration-value" aria-label={formatDuration(minutes)}>
      {durationSegments(minutes).map((part) => (
        <span className="duration-pair" key={part.unit}>
          <span className="duration-num">{part.amount}</span>
          <span className="duration-unit">{part.unit}</span>
        </span>
      ))}
    </div>
  );
}
