import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthTest() {
  const handleRecover = async () => {
    try {
      const response = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email: 'mogunjemilua@gmail.com' })
      });
      
      const result = await response.json();
      console.log('Recovery result:', result);
      
      if (result.success) {
        // Refresh the page to load authenticated state
        window.location.reload();
      }
    } catch (error) {
      console.error('Recovery failed:', error);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Authentication Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>Quick authentication recovery for testing</p>
          <Button onClick={handleRecover} className="w-full">
            Recover Surulere Foods Session
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}