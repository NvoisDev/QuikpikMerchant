import { useState, useEffect } from "react";
import { Check, X, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PasswordStrengthIndicatorProps {
  password: string;
  onPasswordChange: (password: string) => void;
  placeholder?: string;
  showStrength?: boolean;
  className?: string;
  "data-testid"?: string;
}

interface PasswordRequirement {
  text: string;
  met: boolean;
}

export function PasswordStrengthIndicator({ 
  password, 
  onPasswordChange, 
  placeholder = "Enter your password",
  showStrength = true,
  className = "",
  "data-testid": testId
}: PasswordStrengthIndicatorProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [requirements, setRequirements] = useState<PasswordRequirement[]>([]);
  const [strengthScore, setStrengthScore] = useState(0);

  useEffect(() => {
    const newRequirements = [
      { text: "At least 8 characters", met: password.length >= 8 },
      { text: "Contains uppercase letter", met: /[A-Z]/.test(password) },
      { text: "Contains lowercase letter", met: /[a-z]/.test(password) },
      { text: "Contains number", met: /\d/.test(password) },
      { text: "Contains special character", met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
      { text: "No common patterns", met: !['password', '123456', 'qwerty', 'admin', 'welcome'].some(pattern => password.toLowerCase().includes(pattern)) }
    ];

    setRequirements(newRequirements);
    
    const metCount = newRequirements.filter(req => req.met).length;
    setStrengthScore(metCount);
  }, [password]);

  const getStrengthColor = () => {
    if (strengthScore <= 2) return "bg-red-500";
    if (strengthScore <= 4) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getStrengthText = () => {
    if (strengthScore <= 2) return "Weak";
    if (strengthScore <= 4) return "Medium";
    return "Strong";
  };

  const isPasswordStrong = strengthScore >= 6;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          placeholder={placeholder}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          className={`pr-12 ${className}`}
          data-testid={testId}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowPassword(!showPassword)}
          data-testid="toggle-password-visibility"
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4 text-gray-500" />
          ) : (
            <Eye className="h-4 w-4 text-gray-500" />
          )}
        </Button>
      </div>

      {showStrength && password.length > 0 && (
        <div className="space-y-3">
          {/* Strength meter */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Password Strength</span>
              <span className={`text-sm font-medium ${
                strengthScore <= 2 ? 'text-red-600' : 
                strengthScore <= 4 ? 'text-yellow-600' : 
                'text-green-600'
              }`}>
                {getStrengthText()}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${getStrengthColor()}`}
                style={{ width: `${(strengthScore / 6) * 100}%` }}
              />
            </div>
          </div>

          {/* Requirements checklist */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Requirements:</p>
            <div className="grid grid-cols-1 gap-1">
              {requirements.map((req, index) => (
                <div key={index} className="flex items-center space-x-2">
                  {req.met ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                  <span className={`text-sm ${req.met ? 'text-green-700' : 'text-gray-600'}`}>
                    {req.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Password strength summary */}
          {isPasswordStrong && (
            <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Check className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-700">
                Password meets all security requirements
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}