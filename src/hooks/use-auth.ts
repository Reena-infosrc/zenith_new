// A simple auth hook - expand as needed
import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { API_BASE_URL } from '@/config/api';

// Global cache for admin status to prevent repeated API calls
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
interface CacheEntry {
  isAdmin: boolean;
  timestamp: number;
}
const globalAdminCache = new Map<string, CacheEntry>();
const globalPendingChecks = new Map<string, Promise<boolean>>();

type User = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'manager';
  is_admin?: boolean;
  is_manager?: boolean;
  reporting_to?: string; // ID of the person they report to
};

export function useAuth() {
  const { accounts } = useMsal();
  const [user, setUser] = useState<User>({
    id: '1',
    name: 'User',
    email: 'user@example.com',
    role: 'user',
    is_admin: false,
    is_manager: false
  });
  const [isLoading, setIsLoading] = useState(false);

  // Function to check admin status from backend with caching
  const checkAdminStatus = async (email: string) => {
    try {
      // Check cache first
      const cached = globalAdminCache.get(email);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp < CACHE_DURATION_MS)) {
        console.log('📦 Using cached admin status for:', email);
        return cached.isAdmin;
      }
      
      // Check if there's already a pending request
      const pendingCheck = globalPendingChecks.get(email);
      if (pendingCheck) {
        console.log('⏳ Waiting for pending admin check for:', email);
        return await pendingCheck;
      }
      
      // Make API call
      console.log('🔍 Checking admin status for:', email);
      console.log('🌐 API URL:', `${API_BASE_URL}/admin/check/${encodeURIComponent(email)}`);
      
      const fetchPromise = (async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/admin/check/${encodeURIComponent(email)}`);
          console.log('📡 Response status:', response.status);
          
          if (response.ok) {
            const data = await response.json();
            console.log('✅ Admin check result:', data);
            const isAdmin = data.is_admin || false;
            
            // Cache the result
            globalAdminCache.set(email, {
              isAdmin,
              timestamp: Date.now()
            });
            
            return isAdmin;
          } else {
            console.error('❌ Admin check failed:', response.status, response.statusText);
            const isAdmin = false;
            
            // Cache negative result
            globalAdminCache.set(email, {
              isAdmin,
              timestamp: Date.now()
            });
            
            return isAdmin;
          }
        } catch (error) {
          console.error('❌ Error checking admin status:', error);
          return false;
        } finally {
          // Remove from pending checks
          globalPendingChecks.delete(email);
        }
      })();
      
      // Store pending check
      globalPendingChecks.set(email, fetchPromise);
      
      return await fetchPromise;
    } catch (error) {
      console.error('❌ Error in checkAdminStatus:', error);
      return false;
    }
  };

  // Function to update user admin status
  const updateAdminStatus = async (userEmail: string, userName: string) => {
    console.log('🔄 Updating admin status for:', userEmail, userName);
    setIsLoading(true);
    try {
      const isAdmin = await checkAdminStatus(userEmail);
      console.log('🎯 Final admin status:', isAdmin);
      
      setUser(prev => ({
        ...prev,
        email: userEmail,
        name: userName,
        is_admin: isAdmin,
        role: isAdmin ? 'admin' : 'user'
      }));
      
      console.log('👤 User updated:', {
        email: userEmail,
        name: userName,
        is_admin: isAdmin,
        role: isAdmin ? 'admin' : 'user'
      });
    } catch (error) {
      console.error('❌ Error updating admin status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update user info when MSAL account changes
  useEffect(() => {
    console.log('🔐 MSAL accounts changed:', accounts);
    
    if (accounts && accounts.length > 0) {
      const currentAccount = accounts[0];
      const userEmail = currentAccount.username || '';
      const userName = currentAccount.name || '';
      
      console.log('👤 Current account:', {
        email: userEmail,
        name: userName,
        account: currentAccount
      });
      
      if (userEmail) {
        updateAdminStatus(userEmail, userName);
      }
    } else {
      console.log('🚫 No accounts logged in, resetting to default');
      // No account logged in, reset to default
      setUser({
        id: '1',
        name: 'User',
        email: 'user@example.com',
        role: 'user',
        is_admin: false
      });
    }
  }, [accounts]);

  // Check manager status - TODO: Implement API call to check if user is manager
  // For now, checking if position contains "manager" or "lead"
  const checkManagerStatus = (email: string, position?: string): boolean => {
    // TODO: Replace with actual API call
    if (position) {
      const pos = position.toLowerCase();
      return pos.includes('manager') || pos.includes('lead') || pos.includes('director');
    }
    return false;
  };

  return {
    user,
    isLoading,
    isAdmin: user?.is_admin || user?.role === 'admin',
    isManager: user?.is_manager || user?.role === 'manager' || checkManagerStatus(user.email),
    updateAdminStatus
  };
} 