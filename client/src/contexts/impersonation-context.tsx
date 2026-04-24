import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { setImpersonation } from "@/lib/impersonation";

interface ImpersonationState {
  wholesalerId: string | null;
  businessName: string | null;
  token: string | null;
}

interface ImpersonationContextValue {
  impersonation: ImpersonationState;
  startImpersonation: (wholesalerId: string, businessName: string, token: string) => void;
  exitImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  impersonation: { wholesalerId: null, businessName: null, token: null },
  startImpersonation: () => {},
  exitImpersonation: () => {},
});

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const [impersonation, setImpersonationState] = useState<ImpersonationState>({
    wholesalerId: null,
    businessName: null,
    token: null,
  });

  const startImpersonation = useCallback((wholesalerId: string, businessName: string, token: string) => {
    setImpersonation(wholesalerId, token);
    setImpersonationState({ wholesalerId, businessName, token });
  }, []);

  const exitImpersonation = useCallback(() => {
    setImpersonation(null, null);
    setImpersonationState({ wholesalerId: null, businessName: null, token: null });
  }, []);

  useEffect(() => {
    return () => {
      setImpersonation(null, null);
    };
  }, []);

  return (
    <ImpersonationContext.Provider value={{ impersonation, startImpersonation, exitImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
