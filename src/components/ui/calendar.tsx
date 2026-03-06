"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button_previous:
          "h-7 w-7 rounded-md border border-input bg-transparent p-0 opacity-50 hover:bg-accent hover:text-accent-foreground hover:opacity-100 absolute left-1 inline-flex items-center justify-center",
        nav_button_next:
          "h-7 w-7 rounded-md border border-input bg-transparent p-0 opacity-50 hover:bg-accent hover:text-accent-foreground hover:opacity-100 absolute right-1 inline-flex items-center justify-center",
        table: "w-full border-collapse",
        head_row: "grid grid-cols-7",
        head_cell:
          "h-9 w-9 p-0 text-center text-muted-foreground font-medium text-[0.75rem] flex items-center justify-center",
        row: "grid grid-cols-7 mt-1",
        cell: "h-9 w-9 p-0 text-center align-middle relative flex items-center justify-center",
        day: cn(
          "h-9 w-9 p-0 font-normal rounded-md hover:bg-accent hover:text-accent-foreground aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className, ...iconProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("h-4 w-4", className)} {...iconProps} />
          ) : (
            <ChevronRight className={cn("h-4 w-4", className)} {...iconProps} />
          ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
