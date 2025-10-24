// A simple auth hook - expand as needed
import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { API_BASE_URL } from '@/config/api';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  is_admin?: boolean;
};

export function useAuth() {
  const { accounts } = useMsal();
  const [user, setUser] = useState<User>({
    id: '1',
    name: 'User',
    email: 'user@example.com',
    role: 'user',
    is_admin: false
  });
  const [isLoading, setIsLoading] = useState(false);

  // Function to check admin status from backend
  const checkAdminStatus = async (email: string) => {
    try {
      console.log('🔍 Checking admin status for:', email);
      console.log('🌐 API URL:', `${API_BASE_URL}/auth/admins/check/${encodeURIComponent(email)}`);
      
      const response = await fetch(`${API_BASE_URL}/auth/admins/check/${encodeURIComponent(email)}`);
      console.log('📡 Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Admin check result:', data);
        return data.is_admin || false;
      } else {
        console.error('❌ Admin check failed:', response.status, response.statusText);
        
        // Temporary workaround for production - hardcode admin users
        const adminEmails = [
          'jagadeesh.l@infoservices.com'
        ];
        
        if (adminEmails.includes(email)) {
          console.log('🔧 Using temporary admin workaround for:', email);
          return true;
        }
      }
    } catch (error) {
      console.error('❌ Error checking admin status:', error);
      
      // Temporary workaround for production - hardcode admin users
      const adminEmails = [
        'jagadeesh.l@infoservices.com'
      ];
      
      if (adminEmails.includes(email)) {
        console.log('🔧 Using temporary admin workaround for:', email);
        return true;
      }
    }
    return false;
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

  return {
    user,
    isLoading,
    isAdmin: user?.is_admin || user?.role === 'admin',
    updateAdminStatus
  };
} 