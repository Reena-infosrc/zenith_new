#!/usr/bin/env python3
"""
Test script to verify the authentication flow
"""

import requests
import json

def test_msal_token_exchange():
    """Test the MSAL token exchange"""
    
    # Simulate an MSAL token (this is just for testing)
    fake_msal_token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJodHRwczovL2dyYXBoLm1pY3Jvc29mdC5jb20vIiwiaXNzIjoiaHR0cHM6Ly9zdHMud2luZG93cy5uZXQvNzJmOTg4YmYtODZmMS00MWFmLTkxYWItMmQ3Y2QwMTFkYjQ3LyIsImlhdCI6MTY5ODQ5NzIwMCwiZXhwIjoxNjk4NTgwODAwLCJuYmYiOjE2OTg0OTcyMDAsInByZWZlcnJlZF91c2VybmFtZSI6ImphZ2FkZWVzaC5sQGluZm9zZXJ2aWNlcy5jb20iLCJvaWQiOiIxMjM0NTY3OC05YWJjLWRlZi0xMjM0LTU2Nzg5YWJjZGVmIiwic2lkIjoiMTIzNDU2NzgtOWFiYy1kZWYtMTIzNC01Njc4OWFiY2RlZiIsInN1YiI6IjEyMzQ1Njc4LTlhYmMtZGVmLTEyMzQtNTY3ODlhYmNkZWYiLCJ0aWQiOiI3MmY5ODhiZi04NmYxLTQxYWYtOTFhYi0yZDdjZDAxMWRiNDciLCJ1dGkiOiJhYmNkZWYxMi0zNDU2LTc4OTAtYWJjZC1lZjEyMzQ1Njc4IiwidmVyIjoiMS4wIn0.fake_signature"
    
    print("Testing MSAL token exchange...")
    
    try:
        response = requests.post(
            "http://localhost:8000/api/auth/msal-token",
            json={"msal_token": fake_msal_token},
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            token_data = response.json()
            backend_token = token_data["access_token"]
            print(f"✅ Successfully got backend token: {backend_token[:20]}...")
            
            # Now test the admin endpoints with this token
            test_admin_endpoints(backend_token)
        else:
            print(f"❌ Failed to get backend token: {response.text}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

def test_admin_endpoints(backend_token):
    """Test admin endpoints with the backend token"""
    
    headers = {
        "Authorization": f"Bearer {backend_token}",
        "Content-Type": "application/json"
    }
    
    print("\nTesting admin endpoints...")
    
    # Test get admins
    try:
        response = requests.get("http://localhost:8000/api/admins/", headers=headers)
        print(f"GET /api/admins/ - Status: {response.status_code}")
        if response.status_code == 200:
            admins = response.json()
            print(f"✅ Found {len(admins)} admins")
            for admin in admins:
                print(f"   - {admin['name']} ({admin['email']})")
        else:
            print(f"❌ Error: {response.text}")
    except Exception as e:
        print(f"❌ Error testing admins endpoint: {e}")
    
    # Test get employees
    try:
        response = requests.get("http://localhost:8000/api/employees/", headers=headers)
        print(f"GET /api/employees/ - Status: {response.status_code}")
        if response.status_code == 200:
            employees = response.json()
            print(f"✅ Found {len(employees)} employees")
        else:
            print(f"❌ Error: {response.text}")
    except Exception as e:
        print(f"❌ Error testing employees endpoint: {e}")

if __name__ == "__main__":
    test_msal_token_exchange()
