
"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-mobile"

interface DatePickerWithRangeProps extends React.HTMLAttributes<HTMLDivElement> {
    onDateChange: (date: DateRange | undefined) => void;
}

export function DatePickerWithRange({ className, onDateChange }: DatePickerWithRangeProps) {
  const [date, setDate] = React.useState<DateRange | undefined>()
  const [isOpen, setIsOpen] = React.useState(false);
  const isMobile = useIsMobile();

  const handleSelect = (selectedDate: DateRange | undefined) => {
      setDate(selectedDate);
      onDateChange(selectedDate);
      // Close the popover once a full range is selected
      if (selectedDate?.from && selectedDate?.to) {
          setIsOpen(false);
      }
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full sm:w-auto justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleSelect}
            numberOfMonths={isMobile ? 1 : 2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
