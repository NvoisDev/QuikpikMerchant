import React, { useState } from 'react';
import { LoadingSpinner, LoadingOverlay, InlineLoader, CardLoader } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function LoadingDemo() {
  const [showOverlay, setShowOverlay] = useState(false);
  const [showCardLoader, setShowCardLoader] = useState(false);

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Wholesale Mascot Loading States
        </h1>
        <p className="text-gray-600">
          Delightful loading experiences for your wholesale platform
        </p>
      </div>

      {/* Different Sizes */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Loading Spinner Sizes</CardTitle>
          <CardDescription>
            Choose the right size for your use case
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <h3 className="font-semibold mb-4 text-sm">Small (sm)</h3>
              <LoadingSpinner size="sm" message="Loading..." showMascot={true} />
            </div>
            <div className="text-center">
              <h3 className="font-semibold mb-4 text-sm">Medium (md)</h3>
              <LoadingSpinner size="md" message="Loading..." showMascot={true} />
            </div>
            <div className="text-center">
              <h3 className="font-semibold mb-4 text-sm">Large (lg)</h3>
              <LoadingSpinner size="lg" message="Loading..." showMascot={true} />
            </div>
            <div className="text-center">
              <h3 className="font-semibold mb-4 text-sm">Extra Large (xl)</h3>
              <LoadingSpinner size="xl" message="Loading..." showMascot={true} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* With and Without Mascot */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Mascot Options</CardTitle>
          <CardDescription>
            Toggle between mascot and simple spinner
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="text-center">
              <h3 className="font-semibold mb-4">With Mascot</h3>
              <LoadingSpinner 
                size="lg" 
                message="Preparing your wholesale orders..." 
                showMascot={true} 
              />
            </div>
            <div className="text-center">
              <h3 className="font-semibold mb-4">Simple Spinner</h3>
              <LoadingSpinner 
                size="lg" 
                message="Processing payment..." 
                showMascot={false} 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Different Use Cases */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Component Variations</CardTitle>
          <CardDescription>
            Pre-built components for common loading scenarios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Inline Loader */}
          <div>
            <h3 className="font-semibold mb-4">Inline Loader</h3>
            <div className="border rounded-lg bg-gray-50">
              <InlineLoader message="Fetching product data..." size="md" />
            </div>
          </div>

          {/* Card Loader */}
          <div>
            <h3 className="font-semibold mb-4">Card Loader</h3>
            <Card>
              <CardLoader message="Loading customer analytics..." />
            </Card>
          </div>

          {/* Interactive Overlay Demo */}
          <div>
            <h3 className="font-semibold mb-4">Loading Overlay</h3>
            <div className="space-x-4">
              <Button 
                onClick={() => setShowOverlay(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                Show Loading Overlay
              </Button>
              <Button 
                onClick={() => setShowCardLoader(!showCardLoader)}
                variant="outline"
              >
                Toggle Card Loader
              </Button>
            </div>
            
            {showCardLoader && (
              <Card className="mt-4">
                <CardLoader message="Synchronizing with suppliers..." />
              </Card>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contextual Messages */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Contextual Loading Messages</CardTitle>
          <CardDescription>
            Wholesale-specific loading messages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <LoadingSpinner 
              size="md" 
              message="Processing bulk order..." 
              showMascot={true} 
            />
            <LoadingSpinner 
              size="md" 
              message="Updating inventory levels..." 
              showMascot={true} 
            />
            <LoadingSpinner 
              size="md" 
              message="Connecting to suppliers..." 
              showMascot={true} 
            />
            <LoadingSpinner 
              size="md" 
              message="Generating price quotes..." 
              showMascot={true} 
            />
            <LoadingSpinner 
              size="md" 
              message="Sending WhatsApp notifications..." 
              showMascot={true} 
            />
            <LoadingSpinner 
              size="md" 
              message="Calculating shipping rates..." 
              showMascot={true} 
            />
          </div>
        </CardContent>
      </Card>

      {/* Loading Overlay */}
      {showOverlay && (
        <LoadingOverlay message="Setting up your wholesale platform..." />
      )}
      
      {/* Auto-dismiss overlay after 3 seconds */}
      {showOverlay && setTimeout(() => setShowOverlay(false), 3000)}
    </div>
  );
}