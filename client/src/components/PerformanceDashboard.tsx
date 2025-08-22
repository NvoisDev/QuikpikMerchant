import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { usePerformanceMonitor, useMemoryOptimization } from '@/hooks/usePerformanceOptimized';
import { Zap, Clock, Database, Cpu, AlertTriangle } from 'lucide-react';

interface PerformanceMetrics {
  pageLoadTime: number;
  apiResponseTime: number;
  renderTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  errorRate: number;
}

export const PerformanceDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    pageLoadTime: 0,
    apiResponseTime: 0,
    renderTime: 0,
    memoryUsage: 0,
    cacheHitRate: 95,
    errorRate: 0.1
  });
  
  const { markEvent, measureEvent } = usePerformanceMonitor('dashboard');
  const { memoryUsage, isOptimizing } = useMemoryOptimization(100);
  
  useEffect(() => {
    markEvent('dashboard-load');
    
    // Measure initial page performance
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigation) {
      const loadTime = navigation.loadEventEnd - navigation.navigationStart;
      const renderTime = navigation.domContentLoadedEventEnd - navigation.navigationStart;
      
      setMetrics(prev => ({
        ...prev,
        pageLoadTime: loadTime,
        renderTime: renderTime,
        memoryUsage: memoryUsage
      }));
    }
    
    // Monitor API performance
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const apiCalls = entries.filter(entry => 
        entry.name.includes('/api/') && entry.entryType === 'measure'
      );
      
      if (apiCalls.length > 0) {
        const avgResponseTime = apiCalls.reduce((sum, entry) => sum + entry.duration, 0) / apiCalls.length;
        setMetrics(prev => ({
          ...prev,
          apiResponseTime: avgResponseTime
        }));
      }
    });
    
    observer.observe({ entryTypes: ['measure', 'navigation'] });
    
    return () => {
      observer.disconnect();
      measureEvent('dashboard-complete', 'dashboard-load');
    };
  }, [markEvent, measureEvent, memoryUsage]);
  
  const getPerformanceScore = (): number => {
    const weights = {
      pageLoad: 0.3,
      apiResponse: 0.25,
      render: 0.2,
      memory: 0.15,
      cache: 0.1
    };
    
    const scores = {
      pageLoad: Math.max(0, 100 - (metrics.pageLoadTime / 50)), // 50ms = 100 score
      apiResponse: Math.max(0, 100 - (metrics.apiResponseTime / 20)), // 20ms = 100 score
      render: Math.max(0, 100 - (metrics.renderTime / 30)), // 30ms = 100 score
      memory: Math.max(0, 100 - (memoryUsage / 2)), // 2MB = 100 score
      cache: metrics.cacheHitRate
    };
    
    return Math.round(
      scores.pageLoad * weights.pageLoad +
      scores.apiResponse * weights.apiResponse +
      scores.render * weights.render +
      scores.memory * weights.memory +
      scores.cache * weights.cache
    );
  };
  
  const performanceScore = getPerformanceScore();
  
  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };
  
  const getScoreBadgeVariant = (score: number) => {
    if (score >= 90) return 'default';
    if (score >= 70) return 'secondary';
    return 'destructive';
  };
  
  if (process.env.NODE_ENV !== 'development') {
    return null; // Only show in development
  }
  
  return (
    <Card className="fixed bottom-4 right-4 w-80 shadow-lg border-2 z-50 bg-white/95 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center">
            <Zap className="w-4 h-4 mr-2" />
            Performance Monitor
          </span>
          <Badge variant={getScoreBadgeVariant(performanceScore)}>
            Score: {performanceScore}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {/* Page Load Performance */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center">
              <Clock className="w-3 h-3 mr-1" />
              Page Load
            </span>
            <span className={getScoreColor(Math.max(0, 100 - (metrics.pageLoadTime / 50)))}>
              {metrics.pageLoadTime.toFixed(0)}ms
            </span>
          </div>
          <Progress 
            value={Math.min(100, Math.max(0, 100 - (metrics.pageLoadTime / 50)))} 
            className="h-1"
          />
        </div>
        
        {/* API Response Time */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center">
              <Database className="w-3 h-3 mr-1" />
              API Response
            </span>
            <span className={getScoreColor(Math.max(0, 100 - (metrics.apiResponseTime / 20)))}>
              {metrics.apiResponseTime.toFixed(0)}ms
            </span>
          </div>
          <Progress 
            value={Math.min(100, Math.max(0, 100 - (metrics.apiResponseTime / 20)))} 
            className="h-1"
          />
        </div>
        
        {/* Memory Usage */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center">
              <Cpu className="w-3 h-3 mr-1" />
              Memory
              {isOptimizing && <AlertTriangle className="w-3 h-3 ml-1 text-yellow-500" />}
            </span>
            <span className={getScoreColor(Math.max(0, 100 - (memoryUsage / 2)))}>
              {memoryUsage.toFixed(0)}MB
            </span>
          </div>
          <Progress 
            value={Math.min(100, Math.max(0, 100 - (memoryUsage / 2)))} 
            className="h-1"
          />
        </div>
        
        {/* Cache Hit Rate */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span>Cache Hit Rate</span>
            <span className="text-green-600">{metrics.cacheHitRate.toFixed(1)}%</span>
          </div>
          <Progress value={metrics.cacheHitRate} className="h-1" />
        </div>
        
        {/* Performance Tips */}
        {performanceScore < 70 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
            <p className="text-yellow-800 text-xs font-medium">
              💡 Performance Tips:
            </p>
            <ul className="text-yellow-700 text-xs mt-1 space-y-1">
              {metrics.pageLoadTime > 2000 && <li>• Optimize images and assets</li>}
              {metrics.apiResponseTime > 500 && <li>• Check database queries</li>}
              {memoryUsage > 100 && <li>• Memory usage is high</li>}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};