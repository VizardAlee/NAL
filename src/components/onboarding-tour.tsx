
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
import { Card, CardContent } from './ui/card';
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
        <DialogContent className="sm:max-w-md p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Application Tour</DialogTitle>
            <DialogDescription>A quick tour of the application's key features.</DialogDescription>
          </DialogHeader>
          <Carousel className="w-full">
            <CarouselContent>
              {steps.map((step, index) => (
                <CarouselItem key={index}>
                  <div className="p-1">
                    <Card className="border-none shadow-none">
                      <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                        <div className="p-4 bg-primary/10 rounded-full">
                          <step.icon className="h-12 w-12 text-primary" />
                        </div>
                        <h3 className="text-2xl font-semibold font-headline">{step.title}</h3>
                        <p className="text-muted-foreground">{step.description}</p>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-4" />
            <CarouselNext className="right-4" />
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
