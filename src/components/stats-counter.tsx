
'use client';

import { useEffect, useState, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Users, Briefcase, Banknote, Loader2 } from 'lucide-react';
import { Skeleton } from './ui/skeleton';

interface Stats {
  totalUsers: number;
  totalInvestments: number;
  totalDealsFunded: number;
}

const useAnimatedCounter = (target: number, inView: boolean) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (inView) {
      let start = 0;
      const end = target;
      if (start === end) return;

      const duration = 2000;
      const incrementTime = 10;
      const step = (end / (duration / incrementTime));

      const timer = setInterval(() => {
        start += step;
        if (start >= end) {
          clearInterval(timer);
          start = end;
        }
        setCount(start);
      }, incrementTime);

      return () => clearInterval(timer);
    }
  }, [target, inView]);

  return count;
};

const StatCard = ({ icon: Icon, value, label, inView, isCurrency = false }: { icon: React.ElementType, value: number, label: string, inView: boolean, isCurrency?: boolean }) => {
  const animatedValue = useAnimatedCounter(value, inView);

  const formatValue = (val: number) => {
    if (isCurrency) {
      if (val >= 1_000_000_000) return `₦${(val / 1_000_000_000).toFixed(1)}B+`;
      if (val >= 1_000_000) return `₦${(val / 1_000_000).toFixed(1)}M+`;
      if (val >= 1_000) return `₦${Math.floor(val / 1000)}K+`;
      return `₦${Math.floor(val)}`;
    }
    if (val >= 1000) return `${Math.floor(val / 1000)}K+`;
    return Math.floor(val).toLocaleString();
  };

  return (
    <div className="flex flex-col items-center text-center">
      <Icon className="h-10 w-10 text-primary mb-3" />
      <p className="text-4xl font-bold font-headline tracking-tighter text-primary">
        {formatValue(animatedValue)}
      </p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
};

export function StatsCounter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const firestore = useFirestore();
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.5,
  });

  useEffect(() => {
    const fetchStats = async () => {
      if (!firestore) return;

      try {
        const usersSnapshot = await getDocs(collection(firestore, 'users'));
        const fundBatchesSnapshot = await getDocs(collection(firestore, 'fundBatches'));
        const dealsQuery = query(collection(firestore, 'deals'), where('status', 'in', ['Active', 'Completed', 'Terminated']));
        const dealsSnapshot = await getDocs(dealsQuery);

        const totalUsers = usersSnapshot.size;
        const totalInvestments = fundBatchesSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const totalDealsFunded = dealsSnapshot.docs.reduce((sum, doc) => sum + doc.data().principal, 0);

        setStats({ totalUsers, totalInvestments, totalDealsFunded });
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [firestore]);

  return (
    <section ref={ref} className="w-full py-12 md:py-24 bg-muted/50">
      <div className="container">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {loading || !stats ? (
             <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
             </>
          ) : (
            <>
              <StatCard icon={Users} value={stats.totalUsers} label="Total Users" inView={inView} />
              <StatCard icon={Banknote} value={stats.totalInvestments} label="Total Investments" inView={inView} isCurrency />
              <StatCard icon={Briefcase} value={stats.totalDealsFunded} label="Total Deals Funded" inView={inView} isCurrency />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
