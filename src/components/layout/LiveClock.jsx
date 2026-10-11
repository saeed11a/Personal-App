import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { APP_TIME_ZONE, formatAppDate, formatAppStamp, formatAppTime } from "@/lib/datetime";

// Live date and time in the factory's timezone, independent of the device's own
// clock settings. Ticks once a second. The time sits on the first line and the date
// on the second, directly underneath it, so the date stays visible at every width
// instead of only on wide screens. Seconds appear from `lg` up, where the bar has
// room for them; below that the compact time keeps the block narrow.
export default function LiveClock({ className = "" }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const label = `${formatAppStamp(now)} (${APP_TIME_ZONE})`;
  const time = formatAppTime(now);
  const fullTime = formatAppTime(now, { seconds: true });

  return (
    <time
      dateTime={now.toISOString()}
      title={label}
      className={`flex shrink-0 flex-col items-end leading-tight ${className}`}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground sm:gap-1.5">
        {/* The icon gives way on the narrowest phones, where the time itself and the
            LIVE label matter more. */}
        <Clock className="hidden h-3.5 w-3.5 shrink-0 sm:block" />
        <span className="font-mono tabular-nums text-foreground">
          <span className="lg:hidden">{time}</span>
          <span className="hidden lg:inline">{fullTime}</span>
        </span>
      </span>
      <span aria-hidden="true" className="whitespace-nowrap text-[10px] font-medium text-muted-foreground">
        {formatAppDate(now)}
      </span>
    </time>
  );
}
