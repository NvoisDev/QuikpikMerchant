import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  componentStack?: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; reset: () => void }>;
}

function isChunkLoadError(error: Error): boolean {
  return (
    error.message?.includes("Failed to fetch dynamically imported module") ||
    error.message?.includes("Importing a module script failed") ||
    error.message?.includes("Loading chunk") ||
    error.name === "ChunkLoadError"
  );
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (isChunkLoadError(error)) {
      window.location.reload();
      return;
    }
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ componentStack: errorInfo.componentStack ?? undefined });
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.state.error && isChunkLoadError(this.state.error)) {
        return null;
      }

      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error} reset={this.reset} />;
      }

      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="h-8 w-8 text-red-500" />
                <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                The application encountered an error. Please try refreshing the page.
              </p>
              
              {this.state.error && (
                <div className="bg-gray-100 p-3 rounded-md mb-4">
                  <code className="text-xs text-gray-700 break-all">
                    {this.state.error.message}
                  </code>
                  {this.state.componentStack && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer">Component trace</summary>
                      <pre className="text-xs text-gray-600 mt-1 whitespace-pre-wrap overflow-auto max-h-32">
                        {this.state.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}
              
              <div className="flex gap-2">
                <Button onClick={this.reset} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button onClick={() => window.location.reload()} size="sm">
                  Refresh Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
