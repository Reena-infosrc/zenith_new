#!/usr/bin/env python3
"""
Script to fetch all users from Azure AD using Microsoft Graph API

Enhanced Features:
==================

1. CONTACT INFORMATION:
   - Business phones (array)
   - Mobile phone
   
2. ORGANIZATION INFORMATION:
   - Company name
   - Cost center
   - Division
   - Employee type
   - Employee hire date
   - Manager information (fetched separately)
   
3. ADDRESS INFORMATION:
   - Street address
   - City, state, country
   - Postal code
   - Office location
   
4. PERSONAL INFORMATION:
   - Given name, surname, middle name
   - Preferred name
   - Mail nickname
   - About me
   - Skills
   - Interests
   
5. TEAMS INFORMATION (Optional):
   - Joined teams (list with team details)
   - User presence status
   - Profile photo URL
   
6. EXTENSION ATTRIBUTES:
   - Custom on-premises extension attributes
   
Note on LinkedIn:
   LinkedIn profile information is NOT directly available through Microsoft Graph API.
   This would require separate LinkedIn API integration with OAuth user consent.
"""

import os
import sys
import json
import time
import random
from typing import List, Dict, Any, Set
from dotenv import load_dotenv

# Try to import msal, install if not available
try:
    import msal
except ImportError:
    print("MSAL library not found. Installing...")
    os.system("pip install msal")
    import msal

import requests

# Load environment variables
load_dotenv()

# Azure AD Configuration
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID", "97c30056-8614-4cfa-a2a6-8f3f9e29de81")
AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID", "f935d1c4-1947-4beb-b110-e1c801238a42")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "BGs8Q~vrr_4g0sCUO~bqDfXKaJ5rdUR1jrpU9awg")

# Microsoft Graph API endpoints
GRAPH_API_ENDPOINT = "https://graph.microsoft.com/v1.0"
def graph_get(url: str, headers: Dict[str, str], timeout: int = 30, max_retries: int = 8):
    """
    Robust GET wrapper for Microsoft Graph with retry and backoff.
    Retries on 429 and 5xx responses, honoring Retry-After when present.
    """
    attempt = 0
    while True:
        attempt += 1
        resp = requests.get(url, headers=headers, timeout=timeout)

        # Success
        if resp.status_code < 400:
            return resp

        # Retryable statuses
        retryable = resp.status_code == 429 or 500 <= resp.status_code < 600
        if not retryable or attempt >= max_retries:
            return resp

        # Compute delay: Retry-After or exponential backoff with jitter
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            try:
                delay = float(retry_after)
            except ValueError:
                delay = 2.0
        else:
            base = 2 ** (attempt - 1)
            delay = base + random.uniform(0, 0.5 * base)
        # Cap delay to avoid excessively long waits
        if delay > 60:
            delay = 60

        # Optional: include request id in logs for support
        req_id = resp.headers.get("request-id") or resp.headers.get("client-request-id")
        print(f"Graph GET retry {attempt}/{max_retries} for {url} - status {resp.status_code}; waiting {delay:.1f}s" + (f" (request-id: {req_id})" if req_id else ""))
        time.sleep(delay)


def get_access_token() -> str:
    """
    Get an access token for Microsoft Graph API using client credentials flow
    This requires a client secret to be configured in Azure AD
    """
    try:
        # Create MSAL client
        app = msal.ConfidentialClientApplication(
            client_id=AZURE_CLIENT_ID,
            authority=f"https://login.microsoftonline.com/{AZURE_TENANT_ID}",
            client_credential=AZURE_CLIENT_SECRET if AZURE_CLIENT_SECRET else None,
        )

        # Try to get token silently first
        result = app.acquire_token_silent(
            scopes=["https://graph.microsoft.com/.default"],
            account=None
        )

        # If silent acquisition fails, try interactive login
        if not result:
            if AZURE_CLIENT_SECRET:
                # Use client credentials flow (requires client secret)
                result = app.acquire_token_for_client(
                    scopes=["https://graph.microsoft.com/.default"]
                )
            else:
                # Use device code flow for interactive login
                print("\nNo client secret configured. Using device code flow...")
                print("You need to authenticate via a browser.")
                
                flow = app.initiate_device_flow(scopes=["https://graph.microsoft.com/.default"])
                if "user_code" not in flow:
                    raise ValueError("Failed to initiate device flow")

                print(flow["message"])
                
                result = app.acquire_token_by_device_flow(flow)

        if "access_token" in result:
            return result["access_token"]
        else:
            error_message = result.get("error_description", result.get("error", "Unknown error"))
            raise Exception(f"Failed to acquire token: {error_message}")
            
    except Exception as e:
        raise Exception(f"Error getting access token: {str(e)}")


def get_all_users(access_token: str) -> List[Dict[str, Any]]:
    """
    Fetch all users from Azure AD using Microsoft Graph API
    
    Args:
        access_token: OAuth access token
        
    Returns:
        List of user objects with their properties
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        # Helps with large directory reads and $filter scenarios
        "ConsistencyLevel": "eventual",
        "Accept": "application/json"
    }
    
    all_users = []
    next_link = f"{GRAPH_API_ENDPOINT}/users"
    
    try:
        # Paginate through all users
        while next_link:
            response = graph_get(next_link, headers=headers)
            
            if response.status_code != 200:
                error_text = response.text
                raise Exception(f"Failed to fetch users: {response.status_code} - {error_text}")
            
            data = response.json()
            
            # Add current batch of users
            users = data.get("value", [])
            all_users.extend(users)
            
            print(f"Fetched {len(users)} users (total so far: {len(all_users)})")
            
            # Check if there are more users
            next_link = data.get("@odata.nextLink")
            
        return all_users
        
    except Exception as e:
        raise Exception(f"Error fetching users: {str(e)}")


def get_all_users_with_filter(access_token: str, filter_query: str = None, top: int = 250) -> List[Dict[str, Any]]:
    """
    Fetch all users from Azure AD with optional filtering
    
    Args:
        access_token: OAuth access token
        filter_query: OData filter query (e.g., "accountEnabled eq true")
        top: Maximum number of users to return
        
    Returns:
        List of user objects
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "ConsistencyLevel": "eventual",
        "Accept": "application/json"
    }
    
    # Select specific properties including contact, organization, and Teams-related data
    select = (
        "id,displayName,userPrincipalName,mail,accountEnabled,department,jobTitle,"
        "officeLocation,employeeId,companyName,businessPhones,mobilePhone,"
        "givenName,surname,mailNickname,"
        "city,state,country,postalCode,streetAddress,"
        "onPremisesExtensionAttributes,"
        "onPremisesSamAccountName"
    )
    # Minimal fallback selection (used if we keep getting throttled/service errors)
    minimal_select = (
        "id,displayName,userPrincipalName,mail,accountEnabled,department,jobTitle,"
        "givenName,surname"
    )
    
    url = f"{GRAPH_API_ENDPOINT}/users?$select={select}&$top={top}"
    
    if filter_query:
        url += f"&$filter={filter_query}"
    
    all_users = []
    
    try:
        consecutive_page_errors = 0
        current_top = top
        using_minimal = False
        while url:
            response = graph_get(url, headers=headers)
            
            if response.status_code != 200:
                # If service unavailable/throttled even after retries, try to reduce load and continue
                if response.status_code in (429, 503, 502, 504):
                    consecutive_page_errors += 1
                    # Reduce page size progressively and switch to minimal projection if needed
                    if current_top > 50:
                        current_top = max(50, current_top // 2)
                        print(f"⚠️  Received {response.status_code}. Reducing page size to $top={current_top} and retrying...")
                    elif not using_minimal:
                        using_minimal = True
                        url = f"{GRAPH_API_ENDPOINT}/users?$select={minimal_select}&$top={current_top}"
                        if filter_query:
                            url += f"&$filter={filter_query}"
                        print("⚠️  Switching to minimal field selection to avoid throttling/service errors...")
                    else:
                        error_text = response.text
                        raise Exception(f"Failed to fetch users after backoff: {response.status_code} - {error_text}")
                    # Sleep a bit more before retrying the same page
                    time.sleep(5)
                    continue
                else:
                    error_text = response.text
                    raise Exception(f"Failed to fetch users: {response.status_code} - {error_text}")
            else:
                consecutive_page_errors = 0
            
            data = response.json()
            users = data.get("value", [])
            all_users.extend(users)
            
            print(f"Fetched {len(users)} users (total so far: {len(all_users)})")
            
            # Get next page URL if available; if present and current_top changed, ensure $top persists by appending when missing
            next_url = data.get("@odata.nextLink")
            if next_url and "$top=" not in next_url:
                sep = '&' if '?' in next_url else '?'
                next_url = f"{next_url}{sep}$top={current_top}"
            url = next_url
            
        return all_users
        
    except Exception as e:
        raise Exception(f"Error fetching users: {str(e)}")


def load_excluded_users(excluded_file: str = "excluded_users.json") -> Set[str]:
    """
    Load excluded user principal names from a JSON file
    
    Args:
        excluded_file: Path to the JSON file containing excluded users
        
    Returns:
        Set of user principal names to exclude
    """
    try:
        if not os.path.exists(excluded_file):
            print(f"⚠️  Excluded users file '{excluded_file}' not found. No users will be excluded.")
            return set()
        
        with open(excluded_file, "r") as f:
            excluded_list = json.load(f)
        
        excluded_set = set(excluded_list)
        print(f"✅ Loaded {len(excluded_set)} users to exclude from '{excluded_file}'")
        return excluded_set
        
    except Exception as e:
        print(f"⚠️  Error loading excluded users: {str(e)}. No users will be excluded.")
        return set()


def get_user_teams_info(access_token: str, user_id: str) -> Dict[str, Any]:
    """
    Fetch Teams-related information for a specific user
    Includes: joined teams, presence, profile photo
    
    Note: LinkedIn information is not directly available through Microsoft Graph API.
    If LinkedIn integration is needed, it requires separate LinkedIn API integration.
    
    Args:
        access_token: OAuth access token
        user_id: User ID or principal name
        
    Returns:
        Dictionary with Teams information
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    teams_info = {
        "joined_teams": [],
        "presence": None,
        "profile_photo_url": None
    }
    
    try:
        # Get user's joined teams
        teams_url = f"{GRAPH_API_ENDPOINT}/users/{user_id}/joinedTeams"
        response = graph_get(teams_url, headers=headers)
        if response.status_code == 200:
            teams_data = response.json()
            teams_info["joined_teams"] = [
                {
                    "id": team.get("id"),
                    "displayName": team.get("displayName"),
                    "description": team.get("description"),
                    "internalId": team.get("internalId"),
                    "visibility": team.get("visibility"),
                    "webUrl": team.get("webUrl")
                }
                for team in teams_data.get("value", [])
            ]
        
        # Get user presence (if available)
        presence_url = f"{GRAPH_API_ENDPOINT}/users/{user_id}/presence"
        response = graph_get(presence_url, headers=headers)
        if response.status_code == 200:
            teams_info["presence"] = response.json()
        
        # Get profile photo URL
        photo_url = f"{GRAPH_API_ENDPOINT}/users/{user_id}/photo/$value"
        # Note: We'll store the endpoint, not fetch the actual image
        teams_info["profile_photo_url"] = photo_url
        
    except Exception as e:
        # Silently fail for Teams info - not all users may have Teams access
        pass
    
    return teams_info


def get_user_manager_info(access_token: str, user_id: str) -> Dict[str, Any]:
    """
    Fetch manager information for a user
    
    Args:
        access_token: OAuth access token
        user_id: User ID
        
    Returns:
        Dictionary with manager information
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    manager_info = {
        "manager_id": None,
        "manager_display_name": None,
        "manager_email": None
    }
    
    try:
        manager_url = f"{GRAPH_API_ENDPOINT}/users/{user_id}/manager"
        response = graph_get(manager_url, headers=headers)
        if response.status_code == 200:
            manager = response.json()
            manager_info = {
                "manager_id": manager.get("id"),
                "manager_display_name": manager.get("displayName"),
                "manager_email": manager.get("mail") or manager.get("userPrincipalName"),
                "manager_department": manager.get("department"),
                "manager_job_title": manager.get("jobTitle")
            }
    except Exception as e:
        # Manager might not exist
        pass
    
    return manager_info


def format_user_data(users: List[Dict[str, Any]], excluded_users: Set[str] = None, 
                     access_token: str = None, fetch_teams: bool = False) -> List[Dict[str, Any]]:
    """
    Format user data to a cleaner structure and filter excluded users
    
    Args:
        users: Raw user data from Graph API
        excluded_users: Set of user principal names to exclude
        access_token: Access token for fetching additional info (Teams, manager)
        fetch_teams: Whether to fetch Teams information (slower, requires additional API calls)
        
    Returns:
        Formatted list of user dictionaries (excluding specified users)
    """
    if excluded_users is None:
        excluded_users = set()
    
    formatted_users = []
    excluded_count = 0
    
    total = len(users)
    
    for idx, user in enumerate(users, 1):
        upn = user.get("userPrincipalName")
        
        # Skip excluded users
        if upn in excluded_users:
            excluded_count += 1
            continue
        
        # Base user information
        formatted_user = {
            "id": user.get("id"),
            "display_name": user.get("displayName"),
            "user_principal_name": upn,
            "email": user.get("mail") or upn,
            "account_enabled": user.get("accountEnabled"),
            "department": user.get("department"),
            "job_title": user.get("jobTitle"),
            "office_location": user.get("officeLocation"),
            "employee_id": user.get("employeeId"),
            
            # Contact Information
            "contact": {
                "business_phones": user.get("businessPhones", []),
                "mobile_phone": user.get("mobilePhone"),
            },
            
            # Organization Information
            "organization": {
                "company_name": user.get("companyName"),
                "cost_center": user.get("costCenter"),
                "division": user.get("division"),
                "employee_type": user.get("employeeType"),
                "employee_hire_date": user.get("employeeHireDate"),
            },
            
            # Address Information
            "address": {
                "street_address": user.get("streetAddress"),
                "city": user.get("city"),
                "state": user.get("state"),
                "country": user.get("country"),
                "postal_code": user.get("postalCode"),
                "office_location": user.get("officeLocation"),
            },
            
            # Personal Information
            "personal": {
                "given_name": user.get("givenName"),
                "surname": user.get("surname"),
                "middle_name": user.get("middleName"),
                "preferred_name": user.get("preferredName"),
                "mail_nickname": user.get("mailNickname"),
                "about_me": user.get("aboutMe"),
                "skills": user.get("skills", []),
                "interests": user.get("interests", []),
            },
            
            # LinkedIn Information
            # Note: LinkedIn profile data is not directly available via Microsoft Graph API.
            # This would require separate LinkedIn API integration with user consent.
            "linkedin": None,  # Placeholder for future LinkedIn integration
            
            # Extension Attributes (custom fields)
            "extension_attributes": user.get("onPremisesExtensionAttributes", {}),
        }
        
        # Fetch manager information
        if access_token:
            try:
                manager_info = get_user_manager_info(access_token, user.get("id"))
                if manager_info.get("manager_id"):
                    formatted_user["organization"]["manager"] = manager_info
            except Exception as e:
                pass
        
        # Fetch Teams information (optional, slower)
        if fetch_teams and access_token:
            if idx % 10 == 0:
                print(f"  Processing Teams info... ({idx}/{total})")
            try:
                teams_info = get_user_teams_info(access_token, user.get("id"))
                formatted_user["teams"] = teams_info
            except Exception as e:
                formatted_user["teams"] = {
                    "joined_teams": [],
                    "presence": None,
                    "profile_photo_url": None
                }
        
        formatted_users.append(formatted_user)
    
    if excluded_count > 0:
        print(f"\n📝 Excluded {excluded_count} users from the results")
    
    return formatted_users


def save_users_to_file(users: List[Dict[str, Any]], filename: str = "azure_ad_users.json"):
    """Save users to a JSON file"""
    with open(filename, "w") as f:
        json.dump(users, f, indent=2, default=str)
    print(f"\nSaved {len(users)} users to {filename}")


def print_users_summary(users: List[Dict[str, Any]]):
    """Print a summary of the fetched users"""
    print("\n" + "="*80)
    print("AZURE AD USERS SUMMARY")
    print("="*80)
    
    if not users:
        print("No users found.")
        return
    
    print(f"\nTotal Users: {len(users)}")
    
    enabled_users = [u for u in users if u.get("account_enabled")]
    disabled_users = [u for u in users if not u.get("account_enabled")]
    
    print(f"Enabled Users: {len(enabled_users)}")
    print(f"Disabled Users: {len(disabled_users)}")
    
    # Print sample users
    print("\n" + "-"*80)
    print("SAMPLE USERS (First 10):")
    print("-"*80)
    
    for i, user in enumerate(users[:10], 1):
        print(f"\n{i}. {user.get('display_name')}")
        print(f"   Email: {user.get('email')}")
        print(f"   UPN: {user.get('user_principal_name')}")
        print(f"   Department: {user.get('department', 'N/A')}")
        print(f"   Job Title: {user.get('job_title', 'N/A')}")
        print(f"   Employee ID: {user.get('employee_id', 'N/A')}")
        print(f"   Account Enabled: {user.get('account_enabled')}")
        
        # Contact info
        contact = user.get('contact', {})
        if contact.get('mobile_phone'):
            print(f"   Mobile: {contact.get('mobile_phone')}")
        if contact.get('business_phones'):
            print(f"   Business Phone: {', '.join(contact.get('business_phones', []))}")
        
        # Organization info
        org = user.get('organization', {})
        if org.get('company_name'):
            print(f"   Company: {org.get('company_name')}")
        if org.get('manager', {}).get('manager_display_name'):
            print(f"   Manager: {org.get('manager', {}).get('manager_display_name')}")
        
        # Teams info (if available)
        teams = user.get('teams')
        if teams and teams.get('joined_teams'):
            print(f"   Teams Joined: {len(teams.get('joined_teams', []))}")
    
    if len(users) > 10:
        print(f"\n... and {len(users) - 10} more users")


def main():
    """Main function to fetch and display Azure AD users"""
    print("Azure AD Users Fetcher")
    print("="*80)
    
    try:
        # Check configuration
        print(f"\nTenant ID: {AZURE_TENANT_ID}")
        print(f"Client ID: {AZURE_CLIENT_ID}")
        
        if not AZURE_CLIENT_SECRET:
            print("\n⚠️  WARNING: No client secret configured.")
            print("You can either:")
            print("1. Set AZURE_CLIENT_SECRET environment variable")
            print("2. Use device code flow (interactive login)")
            print("")
            response = input("Continue with device code flow? (y/n): ")
            if response.lower() != 'y':
                print("Exiting...")
                return
        
        # Get access token
        print("\n🔐 Authenticating with Azure AD...")
        access_token = get_access_token()
        print("✅ Successfully authenticated!")
        
        # Ask user for options
        print("\n" + "-"*80)
        print("Fetch Options:")
        print("1. All users")
        print("2. Only enabled users")
        print("3. Custom filter")
        print("4. Sample (first 100 users)")
        print("-"*80)
        
        choice = input("\nSelect option (1-4, default=2): ").strip() or "2"
        
        # Fetch users based on choice
        print("\n📥 Fetching users from Azure AD...")
        
        if choice == "1":
            users = get_all_users_with_filter(access_token)
        elif choice == "2":
            users = get_all_users_with_filter(access_token, filter_query="accountEnabled eq true")
        elif choice == "3":
            filter_query = input("Enter OData filter query (e.g., 'accountEnabled eq true'): ")
            users = get_all_users_with_filter(access_token, filter_query=filter_query)
        elif choice == "4":
            users = get_all_users_with_filter(access_token, filter_query="accountEnabled eq true", top=100)
        else:
            users = get_all_users_with_filter(access_token, filter_query="accountEnabled eq true")
        
        if not users:
            print("\n⚠️  No users found.")
            return
        
        # Load excluded users
        excluded_users = load_excluded_users("excluded_users.json")
        
        # Ask if user wants Teams information (slower, requires more API calls)
        print("\n" + "-"*80)
        fetch_teams = input("Fetch Teams information (teams joined, presence)? This will be slower. (y/n, default=n): ").strip().lower() == 'y'
        
        # Format users and exclude specified users
        print("\n📋 Formatting user data...")
        if fetch_teams:
            print("⚠️  Fetching Teams info - this may take a while...")
        formatted_users = format_user_data(users, excluded_users, access_token, fetch_teams)
        
        # Print summary
        print_users_summary(formatted_users)
        
        # Ask to save to file
        print("\n" + "-"*80)
        save_choice = input("Save users to file? (y/n, default=y): ").strip() or "y"
        if save_choice.lower() == 'y':
            filename = input("Enter filename (default=azure_ad_users.json): ").strip() or "azure_ad_users.json"
            save_users_to_file(formatted_users, filename)
        
        print("\n✅ Done!")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()

