import { useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function formatDisplayTime(value: string): string {
  if (!value) return "";
  const [hStr, mStr] = value.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

function TimePickerContent({
  value,
  onChange,
  onDone,
}: {
  value: string;
  onChange: (val: string) => void;
  onDone?: () => void;
}) {
  // Parse current value
  const [hStr, mStr] = (value || "12:00").split(":");
  const hParsed = parseInt(hStr, 10) || 12;
  const mParsed = parseInt(mStr, 10) || 0;

  const [selectedHour, setSelectedHour] = useState(
    hParsed === 0 ? 12 : hParsed > 12 ? hParsed - 12 : hParsed
  );
  const [selectedMinute, setSelectedMinute] = useState(mParsed);
  const [period, setPeriod] = useState<"AM" | "PM">(hParsed >= 12 ? "PM" : "AM");

  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll selected items into view
    const scrollToSelected = (container: HTMLDivElement | null, index: number) => {
      if (!container) return;
      const items = container.querySelectorAll("[data-item]");
      if (items[index]) {
        items[index].scrollIntoView({ block: "center", behavior: "instant" });
      }
    };
    const hIdx = HOURS_12.indexOf(selectedHour);
    const mIdx = MINUTES.indexOf(selectedMinute);
    setTimeout(() => {
      scrollToSelected(hourRef.current, hIdx);
      scrollToSelected(minuteRef.current, mIdx);
    }, 50);
  }, []);

  const commitValue = (h: number, m: number, p: "AM" | "PM") => {
    let h24 = h;
    if (p === "AM" && h === 12) h24 = 0;
    else if (p === "PM" && h !== 12) h24 = h + 12;
    onChange(`${h24.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  };

  const handleHour = (h: number) => {
    setSelectedHour(h);
    commitValue(h, selectedMinute, period);
  };

  const handleMinute = (m: number) => {
    setSelectedMinute(m);
    commitValue(selectedHour, m, period);
  };

  const handlePeriod = (p: "AM" | "PM") => {
    setPeriod(p);
    commitValue(selectedHour, selectedMinute, p);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-stretch h-[200px] gap-0">
        {/* Hours */}
        <div className="flex-1 flex flex-col">
          <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 text-center">Hour</div>
          <ScrollArea className="flex-1">
            <div ref={hourRef} className="flex flex-col py-1">
              {HOURS_12.map((h) => (
                <button
                  key={h}
                  data-item
                  type="button"
                  onClick={() => handleHour(h)}
                  className={cn(
                    "py-2 px-3 text-sm text-center transition-colors rounded-md mx-1",
                    selectedHour === h
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-foreground hover:bg-secondary"
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Divider */}
        <div className="w-px bg-border" />

        {/* Minutes */}
        <div className="flex-1 flex flex-col">
          <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 text-center">Min</div>
          <ScrollArea className="flex-1">
            <div ref={minuteRef} className="flex flex-col py-1">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  data-item
                  type="button"
                  onClick={() => handleMinute(m)}
                  className={cn(
                    "py-2 px-3 text-sm text-center transition-colors rounded-md mx-1",
                    selectedMinute === m
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-foreground hover:bg-secondary"
                  )}
                >
                  {m.toString().padStart(2, "0")}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Divider */}
        <div className="w-px bg-border" />

        {/* AM/PM */}
        <div className="w-16 flex flex-col">
          <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 text-center">&nbsp;</div>
          <div className="flex flex-col justify-center flex-1 gap-1 px-1">
            {(["AM", "PM"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePeriod(p)}
                className={cn(
                  "py-2.5 px-2 text-sm text-center transition-colors rounded-md font-medium",
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-secondary"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {onDone && (
        <div className="p-3 border-t border-border">
          <Button onClick={onDone} className="w-full" size="sm">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

export function TimeInput({
  value,
  onChange,
  className,
  placeholder = "Select time",
}: TimeInputProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const triggerButton = (
    <button
      type="button"
      className={cn(
        "flex h-10 w-full items-center rounded-md border border-input bg-secondary px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        !value && "text-muted-foreground",
        className
      )}
    >
      <span className="flex-1 text-left">
        {value ? formatDisplayTime(value) : placeholder}
      </span>
      <Clock className="h-4 w-4 opacity-50 ml-2" />
    </button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <div onClick={() => setOpen(true)}>{triggerButton}</div>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Select Time</DrawerTitle>
          </DrawerHeader>
          <TimePickerContent
            value={value}
            onChange={onChange}
            onDone={() => setOpen(false)}
          />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <TimePickerContent
          value={value}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  );
}
