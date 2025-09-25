import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Activity, Clock } from 'lucide-react';
import { formatSpeed } from '../utils/uploadUtils.js';

export function NetworkDiagnostics({ uploadManager }) {
  const [diagnostics, setDiagnostics] = useState({
    averageSpeed: 0,
    averageLatency: 0,
    latencyVariance: 0,
    stability: 0,
    isOnline: navigator.onLine
  });
  
  const [isExpanded, setIsExpanded] = useState(false);
  
  useEffect(() => {
    if (!uploadManager) return;
    
    const updateDiagnostics = () => {
      const networkDiagnostics = uploadManager.networkDiagnostics;
      
      setDiagnostics(prev => ({
        ...prev,
        averageSpeed: networkDiagnostics.getAverageSpeed(),
        averageLatency: networkDiagnostics.getAverageLatency(),
        latencyVariance: networkDiagnostics.getLatencyVariance(),
        stability: networkDiagnostics.getNetworkStability(),
        isOnline: navigator.onLine
      }));
    };
    
    // Update diagnostics every 2 seconds
    const interval = setInterval(updateDiagnostics, 2000);
    
    // Listen for online/offline events
    const handleOnline = () => setDiagnostics(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setDiagnostics(prev => ({ ...prev, isOnline: false }));
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [uploadManager]);
  
  const getStabilityColor = (stability) => {
    if (stability > 0.8) return 'text-green-600 dark:text-green-400';
    if (stability > 0.6) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };
  
  const getStabilityText = (stability) => {
    if (stability > 0.8) return 'Excellent';
    if (stability > 0.6) return 'Good';
    if (stability > 0.4) return 'Fair';
    return 'Poor';
  };
  
  return (
    <div className="card p-4 mb-6">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2">
          {diagnostics.isOnline ? (
            <Wifi className="w-5 h-5 text-green-500" />
          ) : (
            <WifiOff className="w-5 h-5 text-red-500" />
          )}
          <span className="font-medium text-gray-900 dark:text-white">
            Network Diagnostics
          </span>
          {diagnostics.averageSpeed > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {formatSpeed(diagnostics.averageSpeed)}
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-1">
            <Activity className="w-4 h-4" />
            <span className={getStabilityColor(diagnostics.stability)}>
              {getStabilityText(diagnostics.stability)}
            </span>
          </div>
          
          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            {isExpanded ? '▼' : '▶'}
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Upload Speed */}
            <div className="text-center">
              <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                {formatSpeed(diagnostics.averageSpeed)}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Average Speed
              </div>
            </div>
            
            {/* Latency */}
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {diagnostics.averageLatency > 0 
                  ? `${Math.round(diagnostics.averageLatency)}ms`
                  : 'N/A'
                }
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Average Latency
              </div>
            </div>
            
            {/* Latency Variance */}
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {diagnostics.latencyVariance > 0 
                  ? `±${Math.round(diagnostics.latencyVariance)}ms`
                  : 'N/A'
                }
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Latency Variance
              </div>
            </div>
            
            {/* Network Stability */}
            <div className="text-center">
              <div className={`text-2xl font-bold ${getStabilityColor(diagnostics.stability)}`}>
                {Math.round(diagnostics.stability * 100)}%
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Stability
              </div>
            </div>
          </div>
          
          {/* Recommendations */}
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              Recommendations
            </h4>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              {diagnostics.stability > 0.8 && diagnostics.averageSpeed > 2 * 1024 * 1024 && (
                <p>• Your connection is excellent! Use large chunks (8-16MB) with high concurrency (6-8)</p>
              )}
              {diagnostics.stability > 0.6 && diagnostics.stability <= 0.8 && (
                <p>• Good connection. Use medium chunks (2-4MB) with moderate concurrency (3-5)</p>
              )}
              {diagnostics.stability <= 0.6 && (
                <p>• Unstable connection detected. Use small chunks (256KB-1MB) with low concurrency (1-3)</p>
              )}
              {diagnostics.averageSpeed < 1024 * 1024 && (
                <p>• Slow connection detected. Consider reducing concurrency to avoid overwhelming the connection</p>
              )}
              {!diagnostics.isOnline && (
                <p>• You're currently offline. Uploads will resume when connection is restored</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}