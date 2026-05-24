"use client";

import * as React from "react";
import { Drawer as VaulDrawer } from "vaul";
import { cn } from "@/lib/utils";

const Drawer = VaulDrawer.Root;
const DrawerTrigger = VaulDrawer.Trigger;
const DrawerPortal = VaulDrawer.Portal;
const DrawerClose = VaulDrawer.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-[850] bg-black/30", className)}
    {...props}
  />
));
DrawerOverlay.displayName = "DrawerOverlay";

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Content>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Content> & {
    withHandle?: boolean;
    direction?: "bottom" | "top" | "left" | "right";
  }
>(({ className, children, withHandle = true, direction = "bottom", ...props }, ref) => {
  const sideClasses = {
    bottom:
      "inset-x-0 bottom-0 mt-24 flex h-auto flex-col rounded-t-[24px] border-t",
    top: "inset-x-0 top-0 mb-24 flex h-auto flex-col rounded-b-[24px] border-b",
    left: "inset-y-0 left-0 mr-24 flex w-[88%] max-w-[360px] flex-col rounded-r-[24px] border-r",
    right:
      "inset-y-0 right-0 ml-24 flex w-[88%] max-w-[360px] flex-col rounded-l-[24px] border-l"
  } as const;

  return (
    <VaulDrawer.Content
      ref={ref}
      className={cn(
        "fixed z-[860] border-[var(--hairline)] bg-[var(--canvas)] text-[var(--ink)] shadow-[0_-20px_60px_rgba(0,0,0,0.18)] focus:outline-none",
        sideClasses[direction],
        className
      )}
      {...props}
    >
      {withHandle && direction === "bottom" ? (
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-black/15" aria-hidden />
      ) : null}
      {children}
    </VaulDrawer.Content>
  );
});
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 p-5 pb-3 text-left", className)} {...props} />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-5 pt-3", className)} {...props} />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Title>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Title>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Title
    ref={ref}
    className={cn("text-2xl font-[340] leading-tight", className)}
    {...props}
  />
));
DrawerTitle.displayName = "DrawerTitle";

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Description>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Description>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Description
    ref={ref}
    className={cn("text-sm text-black/60", className)}
    {...props}
  />
));
DrawerDescription.displayName = "DrawerDescription";

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger
};
