
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';
import { useUser } from '@/firebase';

export type OnboardingStep = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type OnboardingTourContextType = {
  showTour: () => void;
};

const OnboardingTourContext = createContext<OnboardingTourContextType | null>(null);

export function OnboardingTourProvider({ children, steps, storageKey }: { children: React.ReactNode, steps: OnboardingStep[], storageKey: string }) {
  const { user, loading } = useUser();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (loading || !user) return;

    try {
      const hasSeenTour = localStorage.getItem(storageKey);
      if (!hasSeenTour) {
        setIsOpen(true);
      }
    } catch (error) {
      console.error("Could not access localStorage:", error);
      setIsOpen(false);
    }
  }, [storageKey, user, loading]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(storageKey, 'true');
      setIsOpen(false);
    } catch (error)      {
      console.error("Could not write to localStorage:", error);
      setIsOpen(false);
    }
  };
  
  const contextValue = useMemo(() => ({
    showTour: () => setIsOpen(true)
  }), []);


  if (!steps || steps.length === 0) {
    return <>{children}</>;
  }

  return (
    <OnboardingTourContext.Provider value={contextValue}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Application Tour</DialogTitle>
            <DialogDescription>A quick tour of the application's key features.</DialogDescription>
          </DialogHeader>
          <Carousel className="w-full">
            <CarouselContent>
              {steps.map((step, index) => (
                <CarouselItem key={index}>
                  <div className="p-1">
                    <div className="grid md:grid-cols-2 items-center">
                        <div className="hidden md:flex items-center justify-center p-8 bg-muted/50 h-full rounded-l-lg">
                           <div className="p-6 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full">
                             <step.icon className="h-16 w-16 text-primary" />
                           </div>
                        </div>
                        <div className="p-8 space-y-4">
                            <div className="flex md:hidden items-center justify-center p-4 bg-muted/50 rounded-full w-24 h-24 mx-auto">
                                <step.icon className="h-10 w-10 text-primary" />
                            </div>
                            <h3 className="text-2xl font-semibold font-headline text-center md:text-left">{step.title}</h3>
                            <p className="text-muted-foreground text-center md:text-left">{step.description}</p>
                        </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-4 hidden sm:flex" />
            <CarouselNext className="right-4 hidden sm:flex" />
          </Carousel>
          <div className="px-6 pb-6 text-center">
              <Button onClick={handleDismiss} className="w-full">
                  Get Started
              </Button>
          </div>
        </DialogContent>
      </Dialog>
    </OnboardingTourContext.Provider>
  );
}

export const useOnboardingTour = () => {
    const context = useContext(OnboardingTourContext);
    if (!context) {
        throw new Error("useOnboardingTour must be used within an OnboardingTourProvider");
    }
    return context;
}
