import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Play, Pause, RotateCcw, Settings, Zap } from 'lucide-react';
import { UploadManager } from '../services/UploadManager.js';
import { FileCard } from './FileCard.jsx';
import { SettingsPanel } from './SettingsPanel.jsx';
import { NetworkDiagnostics } from './NetworkDiagnostics.jsx';
import { formatFileSize } from '../utils/uploadUtils.js';

export function FileUploader() {
  const [uploads, setUploads] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    chunkSize: 1024 * 1024, // 1MB
    concurrency: 3,
    autoTune: true,
    storageType: 's3'
  });
  
  const uploadManagerRef = useRef(null);
  
  // Initialize upload manager
  if (!uploadManagerRef.current) {
    uploadManagerRef.current = new UploadManager(settings);
  }
  
  const onDrop = useCallback(async (acceptedFiles) => {
    const newUploads = [];
    
    for (const file of acceptedFiles) {
      try {
        const upload = await uploadManagerRef.current.createUpload(
          file, 
          settings.storageType,
          settings
        );
        newUploads.push(upload);
      } catch (error) {
        console.error('Failed to create upload:', error);
      }
    }
    
    setUploads(prev => [...prev, ...newUploads]);
  }, [settings]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    noClick: false,
    noKeyboard: false
  });
  
  const startAllUploads = () => {
    uploads.forEach(upload => {
      if (upload.status === 'pending' || upload.status === 'paused') {
        uploadManagerRef.current.startUpload(upload.id);
      }
    });
  };
  
  const pauseAllUploads = () => {
    uploads.forEach(upload => {
      if (upload.status === 'uploading') {
        uploadManagerRef.current.pauseUpload(upload.id);
      }
    });
  };
  
  const resumeAllUploads = () => {
    uploads.forEach(upload => {
      if (upload.status === 'paused') {
        uploadManagerRef.current.resumeUpload(upload.id);
      }
    });
  };
  
  const cancelAllUploads = () => {
    uploads.forEach(upload => {
      uploadManagerRef.current.cancelUpload(upload.id);
    });
  };
  
  const removeUpload = (uploadId) => {
    setUploads(prev => prev.filter(upload => upload.id !== uploadId));
  };
  
  const updateSettings = (newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    // Update upload manager settings
    uploadManagerRef.current.options = { ...uploadManagerRef.current.options, ...newSettings };
  };
  
  const totalSize = uploads.reduce((sum, upload) => sum + upload.file.size, 0);
  const completedSize = uploads.reduce((sum, upload) => {
    const completedBytes = Array.from(upload.completedChunks || [])
      .reduce((chunkSum, chunkIndex) => chunkSum + upload.chunks[chunkIndex].size, 0);
    return sum + completedBytes;
  }, 0);
  
  const overallProgress = totalSize > 0 ? (completedSize / totalSize) * 100 : 0;
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              High Speed File Uploader
            </h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="btn-secondary flex items-center space-x-2"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>
            </div>
          </div>
          
          {/* Overall Progress */}
          {uploads.length > 0 && (
            <div className="card p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Overall Progress
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {formatFileSize(completedSize)} / {formatFileSize(totalSize)}
                </span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Settings Panel */}
        {isSettingsOpen && (
          <SettingsPanel
            settings={settings}
            onUpdate={updateSettings}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}
        
        {/* Network Diagnostics */}
        <NetworkDiagnostics uploadManager={uploadManagerRef.current} />
        
        {/* Upload Area */}
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
            ${isDragActive 
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' 
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500'
            }
          `}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            {isDragActive ? 'Drop files here' : 'Drag & drop files here, or click to select'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Support for files up to multiple GB with chunked, resumable uploads
          </p>
        </div>
        
        {/* Global Controls */}
        {uploads.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={startAllUploads}
                className="btn-primary flex items-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>Start All</span>
              </button>
              <button
                onClick={pauseAllUploads}
                className="btn-secondary flex items-center space-x-2"
              >
                <Pause className="w-4 h-4" />
                <span>Pause All</span>
              </button>
              <button
                onClick={resumeAllUploads}
                className="btn-secondary flex items-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>Resume All</span>
              </button>
              <button
                onClick={cancelAllUploads}
                className="btn-danger flex items-center space-x-2"
              >
                <X className="w-4 h-4" />
                <span>Cancel All</span>
              </button>
            </div>
            
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {uploads.length} file{uploads.length !== 1 ? 's' : ''} selected
            </div>
          </div>
        )}
        
        {/* File List */}
        <div className="mt-8 space-y-4">
          {uploads.map(upload => (
            <FileCard
              key={upload.id}
              upload={upload}
              onRemove={() => removeUpload(upload.id)}
              onStart={() => uploadManagerRef.current.startUpload(upload.id)}
              onPause={() => uploadManagerRef.current.pauseUpload(upload.id)}
              onResume={() => uploadManagerRef.current.resumeUpload(upload.id)}
              onCancel={() => uploadManagerRef.current.cancelUpload(upload.id)}
              onRetry={() => {
                // Reset upload and restart
                upload.status = 'pending';
                upload.progress = 0;
                upload.completedChunks = new Set();
                upload.failedChunks = new Set();
                uploadManagerRef.current.startUpload(upload.id);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}