import { StytchLogin, useStytch, useStytchUser } from "@stytch/react";
import {
  OAuthProviders,
  Products,
  type StytchLoginConfig,
} from "@stytch/vanilla-js";
import { useEffect, useMemo } from "react";

/**
 * A higher-order component that enforces a login requirement for the wrapped component.
 * If the user is not logged in, the user is redirected to the login page and the
 * current URL is stored in localStorage to enable return after authentication.
 */
export const withLoginRequired = (Component: React.FC) => () => {
  const { user, fromCache } = useStytchUser();
  
  console.log('withLoginRequired check:', { user, fromCache });
  
  useEffect(() => {
    // Don't redirect if we're still loading user from cache
    if (fromCache) {
      console.log('Still loading user from cache...');
      return;
    }
    
    if (!user) {
      console.log('No user found, redirecting to login');
      localStorage.setItem("returnTo", window.location.href);
      window.location.href = "/login";
    }
  }, [user, fromCache]);
  
  // Show loading while checking cache
  if (fromCache) {
    return <div>Loading...</div>;
  }
  
  if (!user) {
    return null;
  }
  
  return <Component />;
};

/**
 * The other half of the withLoginRequired flow
 * Redirects the user to a specified URL stored in local storage or a default location.
 */
const onLoginComplete = async () => {
  console.log('onLoginComplete called');
  
  // Skip worker sync for now to simplify debugging
  
  const returnTo = localStorage.getItem("returnTo");
  console.log('Return to URL:', returnTo);
  
  if (returnTo && returnTo !== "") {
    localStorage.removeItem("returnTo");
    console.log('Redirecting to saved URL:', returnTo);
    window.location.href = returnTo;
  } else {
    console.log('Redirecting to dashboard');
    window.location.href = "/dashboard";
  }
};

/**
 * The Login page implementation. Wraps the StytchLogin UI component.
 */
export function Login() {
  const loginConfig = useMemo<StytchLoginConfig>(
    () => ({
      oauthOptions: {
        loginRedirectURL: `${window.location.origin}/authenticate`,
        providers: [{ type: OAuthProviders.Google }],
        signupRedirectURL: `${window.location.origin}/authenticate`,
      },
      products: [Products.oauth],
    }),
    [],
  );
  
  // Debug: Log the redirect URLs
  console.log('OAuth Redirect URLs:', {
    login: `${window.location.origin}/authenticate`,
    signup: `${window.location.origin}/authenticate`,
  });
  
  return (
    <div style={{ maxWidth: "400px", margin: "0 auto" }}>
      <StytchLogin config={loginConfig} />
    </div>
  );
}

/**
 * The Authentication callback page implementation. Handles completing the login flow after OAuth
 */
export function Authenticate() {
  const client = useStytch();
  
  useEffect(() => {
    console.log('Authenticate component mounted');
    console.log('Current URL:', window.location.href);
    
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    
    console.log('Token from URL:', token);
    
    if (!token) {
      console.error('No token in URL params');
      return;
    }
    
    console.log('Attempting to authenticate with token...');
    
    client.oauth
      .authenticate(token, { session_duration_minutes: 60 }) // 1 hour
      .then(async (response) => {
        console.log('OAuth authenticate response:', response);
        
        // Store session info
        localStorage.setItem("stytch_session", response.session_token);
        localStorage.setItem("stytch_user_id", response.user.user_id);
        
        // Notify the worker about the new session
        try {
          const workerUrl = import.meta.env.VITE_WORKER_URL || "https://rec-us-mcp-server-auth.lizziepika.workers.dev";
          console.log('Notifying worker at:', `${workerUrl}/authenticate?token=${token}`);
          
          const workerResponse = await fetch(`${workerUrl}/authenticate?token=${token}`, {
            method: 'GET',
            headers: {
              'Accept': 'text/plain',
            },
          });
          
          if (!workerResponse.ok) {
            console.error('Worker notification failed:', await workerResponse.text());
          } else {
            console.log('Worker notified successfully');
          }
        } catch (error) {
          console.error('Failed to notify worker:', error);
          // Continue anyway - the session is stored locally
        }
        
        console.log('Authentication successful, redirecting...');
        onLoginComplete();
      })
      .catch((error) => {
        console.error("Authentication failed:", error);
        alert(`Authentication failed: ${error.message}`);
        window.location.href = "/login";
      });
  }, [client]);
  
  return <div>Authenticating... (check console for debug info)</div>;
}

/**
 * Logout button component
 */
export const Logout = () => {
  const stytch = useStytch();
  const { user } = useStytchUser();
  
  if (!user) return null;
  
  const handleLogout = async () => {
    try {
      await stytch.session.revoke();
      localStorage.removeItem("stytch_session");
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };
  
  return (
    <button type="button" onClick={handleLogout}>
      Log Out
    </button>
  );
};