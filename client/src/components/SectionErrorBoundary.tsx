import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SectionErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface SectionErrorBoundaryProps {
  children: React.ReactNode;
  sectionName?: string;
}

class SectionErrorBoundary extends React.Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const msg = error.message ?? '';
    if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Loading chunk') || msg.includes('Importing a module script failed')) {
      window.location.reload();
      return;
    }
    console.error(`SectionErrorBoundary [${this.props.sectionName ?? 'unknown'}] caught an error:`, error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const section = this.props.sectionName ?? 'This section';
      return (
        <div className="w-full p-6">
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">
                    {section} ran into a problem
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    The rest of the app is still working. You can try reloading this section.
                  </p>
                  {this.state.error && (
                    <p className="text-xs text-red-500 dark:text-red-500 mt-1 font-mono truncate" title={this.state.error.message}>
                      {this.state.error.message}
                    </p>
                  )}
                </div>
                <Button
                  onClick={this.reset}
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Reload section
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

export default SectionErrorBoundary;
