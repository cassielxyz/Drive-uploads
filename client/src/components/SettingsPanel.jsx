import React from 'react';
import { X, Save, RotateCcw } from 'lucide-react';
import { CHUNK_SIZE_OPTIONS, CONCURRENCY_OPTIONS, STORAGE_TYPES } from '../utils/uploadUtils.js';

export function SettingsPanel({ settings, onUpdate, onClose }) {
  const [localSettings, setLocalSettings] = React.useState(settings);
  
  const handleSave = () => {
    onUpdate(localSettings);
    onClose();
  };
  
  const handleReset = () => {
    setLocalSettings({
      chunkSize: 1024 * 1024,
      concurrency: 3,
      autoTune: true,
      storageType: 's3'
    });
  };
  
  const handleChunkSizeChange = (value) => {
    setLocalSettings(prev => ({
      ...prev,
      chunkSize: parseInt(value)
    }));
  };
  
  const handleConcurrencyChange = (value) => {
    setLocalSettings(prev => ({
      ...prev,
      concurrency: parseInt(value)
    }));
  };
  
  const handleStorageTypeChange = (value) => {
    setLocalSettings(prev => ({
      ...prev,
      storageType: value
    }));
  };
  
  const handleAutoTuneChange = (checked) => {
    setLocalSettings(prev => ({
      ...prev,
      autoTune: checked
    }));
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Upload Settings
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="space-y-6">
            {/* Storage Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Storage Provider
              </label>
              <select
                value={localSettings.storageType}
                onChange={(e) => handleStorageTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={STORAGE_TYPES.S3}>Amazon S3</option>
                <option value={STORAGE_TYPES.GOOGLE_DRIVE}>Google Drive</option>
                <option value={STORAGE_TYPES.GCS}>Google Cloud Storage</option>
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Choose your preferred cloud storage provider
              </p>
            </div>
            
            {/* Chunk Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Chunk Size
              </label>
              <select
                value={localSettings.chunkSize}
                onChange={(e) => handleChunkSizeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {CHUNK_SIZE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Larger chunks = fewer requests but more memory usage. Smaller chunks = more requests but better for unstable connections.
              </p>
            </div>
            
            {/* Concurrency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Upload Concurrency
              </label>
              <select
                value={localSettings.concurrency}
                onChange={(e) => handleConcurrencyChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {CONCURRENCY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label} concurrent upload{option.value !== 1 ? 's' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Higher concurrency = faster uploads but more bandwidth usage. Lower concurrency = more stable but slower.
              </p>
            </div>
            
            {/* Auto Tune */}
            <div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="autoTune"
                  checked={localSettings.autoTune}
                  onChange={(e) => handleAutoTuneChange(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <label htmlFor="autoTune" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Enable Auto-Tuning
                </label>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Automatically adjust chunk size based on network conditions for optimal performance
              </p>
            </div>
            
            {/* Performance Tips */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
                Performance Tips
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                <li>• For stable, fast connections: Use larger chunks (4-16MB) with high concurrency (4-8)</li>
                <li>• For unstable connections: Use smaller chunks (256KB-1MB) with lower concurrency (1-3)</li>
                <li>• Enable auto-tuning to let the system optimize settings automatically</li>
                <li>• S3 and GCS support parallel multipart uploads for best performance</li>
                <li>• Google Drive works best with 1-2MB chunks due to API limitations</li>
              </ul>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleReset}
              className="btn-secondary flex items-center space-x-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
            <button
              onClick={handleSave}
              className="btn-primary flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>Save Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}