import React from 'react';
import { 
  Play, 
  Pause, 
  X, 
  RotateCcw, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Zap,
  File,
  Image as ImageIcon
} from 'lucide-react';
import { formatFileSize, formatSpeed, UPLOAD_STATUS } from '../utils/uploadUtils.js';

export function FileCard({ 
  upload, 
  onRemove, 
  onStart, 
  onPause, 
  onResume, 
  onCancel, 
  onRetry 
}) {
  const getFileIcon = (filename) => {
    const extension = filename.toLowerCase().split('.').pop();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    
    if (imageExtensions.includes(extension)) {
      return <ImageIcon className="w-8 h-8 text-blue-500" />;
    }
    
    return <File className="w-8 h-8 text-gray-500" />;
  };
  
  const getStatusIcon = (status) => {
    switch (status) {
      case UPLOAD_STATUS.COMPLETED:
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case UPLOAD_STATUS.FAILED:
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case UPLOAD_STATUS.UPLOADING:
        return <Zap className="w-5 h-5 text-blue-500 animate-pulse" />;
      case UPLOAD_STATUS.PAUSED:
        return <Pause className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };
  
  const getStatusText = (status) => {
    switch (status) {
      case UPLOAD_STATUS.PENDING:
        return 'Pending';
      case UPLOAD_STATUS.UPLOADING:
        return 'Uploading';
      case UPLOAD_STATUS.PAUSED:
        return 'Paused';
      case UPLOAD_STATUS.COMPLETED:
        return 'Completed';
      case UPLOAD_STATUS.FAILED:
        return 'Failed';
      case UPLOAD_STATUS.CANCELLED:
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };
  
  const getStatusColor = (status) => {
    switch (status) {
      case UPLOAD_STATUS.COMPLETED:
        return 'text-green-600 dark:text-green-400';
      case UPLOAD_STATUS.FAILED:
        return 'text-red-600 dark:text-red-400';
      case UPLOAD_STATUS.UPLOADING:
        return 'text-blue-600 dark:text-blue-400';
      case UPLOAD_STATUS.PAUSED:
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };
  
  const canStart = upload.status === UPLOAD_STATUS.PENDING || upload.status === UPLOAD_STATUS.FAILED;
  const canPause = upload.status === UPLOAD_STATUS.UPLOADING;
  const canResume = upload.status === UPLOAD_STATUS.PAUSED;
  const canCancel = upload.status === UPLOAD_STATUS.UPLOADING || upload.status === UPLOAD_STATUS.PAUSED;
  const canRetry = upload.status === UPLOAD_STATUS.FAILED;
  
  return (
    <div className="card p-6">
      <div className="flex items-start space-x-4">
        {/* File Icon */}
        <div className="flex-shrink-0">
          {getFileIcon(upload.file.name)}
        </div>
        
        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate">
              {upload.file.name}
            </h3>
            <div className="flex items-center space-x-2">
              {getStatusIcon(upload.status)}
              <span className={`text-sm font-medium ${getStatusColor(upload.status)}`}>
                {getStatusText(upload.status)}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
            <span>{formatFileSize(upload.file.size)}</span>
            {upload.speed > 0 && (
              <span>{formatSpeed(upload.speed)}</span>
            )}
            {upload.eta && upload.eta !== 'Calculating...' && (
              <span>ETA: {upload.eta}</span>
            )}
          </div>
          
          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Progress
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {upload.progress.toFixed(1)}%
              </span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${upload.progress}%` }}
              />
            </div>
          </div>
          
          {/* Error Message */}
          {upload.error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">
                {upload.error}
              </p>
            </div>
          )}
          
          {/* Chunk Status */}
          {upload.chunks && upload.chunks.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Chunks: {upload.completedChunks?.size || 0} / {upload.chunks.length}
                </span>
                {upload.failedChunks?.size > 0 && (
                  <span className="text-sm text-red-600 dark:text-red-400">
                    Failed: {upload.failedChunks.size}
                  </span>
                )}
              </div>
              
              {/* Chunk Progress Visualization */}
              <div className="flex flex-wrap gap-1">
                {upload.chunks.map((chunk, index) => {
                  const isCompleted = upload.completedChunks?.has(index);
                  const isFailed = upload.failedChunks?.has(index);
                  const isUploading = chunk.status === UPLOAD_STATUS.UPLOADING;
                  
                  return (
                    <div
                      key={index}
                      className={`
                        w-2 h-2 rounded-sm
                        ${isCompleted 
                          ? 'bg-green-500' 
                          : isFailed 
                            ? 'bg-red-500' 
                            : isUploading 
                              ? 'bg-blue-500 animate-pulse' 
                              : 'bg-gray-300 dark:bg-gray-600'
                        }
                      `}
                      title={`Chunk ${index + 1}: ${isCompleted ? 'Completed' : isFailed ? 'Failed' : isUploading ? 'Uploading' : 'Pending'}`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="flex-shrink-0 flex flex-col space-y-2">
          {canStart && (
            <button
              onClick={onStart}
              className="btn-primary flex items-center space-x-2 text-sm"
            >
              <Play className="w-4 h-4" />
              <span>Start</span>
            </button>
          )}
          
          {canPause && (
            <button
              onClick={onPause}
              className="btn-secondary flex items-center space-x-2 text-sm"
            >
              <Pause className="w-4 h-4" />
              <span>Pause</span>
            </button>
          )}
          
          {canResume && (
            <button
              onClick={onResume}
              className="btn-primary flex items-center space-x-2 text-sm"
            >
              <Play className="w-4 h-4" />
              <span>Resume</span>
            </button>
          )}
          
          {canRetry && (
            <button
              onClick={onRetry}
              className="btn-secondary flex items-center space-x-2 text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retry</span>
            </button>
          )}
          
          {canCancel && (
            <button
              onClick={onCancel}
              className="btn-danger flex items-center space-x-2 text-sm"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          )}
          
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
            title="Remove from list"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}