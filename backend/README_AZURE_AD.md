# Azure AD Users Fetcher

This script fetches all users from Azure Active Directory using the Microsoft Graph API.

## Prerequisites

1. **Azure AD App Registration**: You need to have an Azure AD application registered with the following permissions:
   - Microsoft Graph API: `User.Read.All` (Application permission)
   - Microsoft Graph API: `Directory.Read.All` (Application permission)

2. **Python Dependencies**: The script requires the following packages:
   - `msal` - Microsoft Authentication Library
   - `requests` - HTTP library
   - `python-dotenv` - Environment variable management

## Configuration

### Option 1: Client Credentials Flow (Recommended for Automation)

1. Create a client secret in your Azure AD app registration:
   - Go to Azure Portal > App Registrations > Your App > Certificates & secrets
   - Create a new client secret

2. Set environment variables in your `.env` file:
   ```bash
   AZURE_TENANT_ID=your-tenant-id
   AZURE_CLIENT_ID=your-client-id
   AZURE_CLIENT_SECRET=your-client-secret
   ```

### Option 2: Device Code Flow (Interactive)

If you don't have a client secret configured, the script will use device code flow, which requires interactive authentication in a browser.

## Usage

### Basic Usage

```bash
# From the backend directory
python fetch_azure_ad_users.py
```

The script will:
1. Authenticate with Azure AD
2. Show fetch options (all users, enabled users, custom filter, sample)
3. Fetch users based on your selection
4. Display a summary of fetched users
5. Optionally save the results to a JSON file

### Command Line Options

The script is interactive and will prompt you for:
- Fetch option (all, enabled only, custom filter, or sample)
- Whether to save results to a file
- Filename for the output file

### Example Output

```bash
$ python fetch_azure_ad_users.py

Azure AD Users Fetcher
================================================================================

Tenant ID: 97c30056-8614-4cfa-a2a6-8f3f9e29de81
Client ID: 84857ef6-8b76-45f8-8be1-877af61283fc

🔐 Authenticating with Azure AD...
✅ Successfully authenticated!

--------------------------------------------------------------------------------
Fetch Options:
1. All users
2. Only enabled users
3. Custom filter
4. Sample (first 100 users)
--------------------------------------------------------------------------------

Select option (1-4, default=2): 2

📥 Fetching users from Azure AD...
Fetched 50 users (total so far: 50)
Fetched 50 users (total so far: 100)
...

================================================================================
AZURE AD USERS SUMMARY
================================================================================

Total Users: 245
Enabled Users: 230
Disabled Users: 15

--------------------------------------------------------------------------------
SAMPLE USERS (First 10):
--------------------------------------------------------------------------------

1. John Doe
   Email: john.doe@infoservices.com
   UPN: john.doe@infoservices.com
   Department: Engineering
   Job Title: Software Engineer
   Employee ID: EMP001
   Account Enabled: True

...
```

## File Format

The output JSON file contains an array of user objects with the following structure:

```json
[
  {
    "id": "12345678-abcd-1234-efgh-123456789012",
    "display_name": "John Doe",
    "user_principal_name": "john.doe@infoservices.com",
    "email": "john.doe@infoservices.com",
    "account_enabled": true,
    "department": "Engineering",
    "job_title": "Software Engineer",
    "office_location": "Building A, Floor 3",
    "employee_id": "EMP001"
  }
]
```

## OData Filter Query Examples

If you choose option 3 (Custom filter), you can use OData filter syntax:

```bash
# Filter by enabled status
accountEnabled eq true

# Filter by department
department eq 'Engineering'

# Filter by user type
userType eq 'Member'

# Combined filters
accountEnabled eq true and department eq 'Engineering'

# Contains filter
contains(displayName, 'John')

# Date filters (users created in last 30 days)
createdDateTime ge 2024-01-01T00:00:00Z
```

## Troubleshooting

### Error: Failed to acquire token

- Check that your `AZURE_CLIENT_SECRET` is correct
- Verify that the client secret hasn't expired
- Ensure the app has the required permissions granted admin consent

### Error: Failed to fetch users (403 Forbidden)

- Verify that the app has `User.Read.All` or `Directory.Read.All` permissions
- Ensure admin consent has been granted for these permissions

### Error: MSAL library not found

```bash
pip install msal
```

### No users returned

- Check your filter query syntax
- Verify that you have the correct permissions
- Try fetching all users without filters first

## Security Notes

- Never commit `.env` files with secrets to version control
- Client secrets should be stored securely (e.g., Azure Key Vault)
- Use application permissions (not delegated) for unattended operations
- Follow the principle of least privilege when assigning permissions

## Integration with Zenith HR Pulse

You can integrate this with the Zenit HR Pulse application to:

1. **Sync Users**: Automatically create employee records from Azure AD users
2. **User Management**: Populate the admin database with users from Azure AD
3. **Onboarding**: Identify new users who need to be onboarded

### Example Integration

```python
# In seed_admin_data.py or similar
from fetch_azure_ad_users import get_all_users_with_filter, get_access_token, format_user_data

# Get users from Azure AD
access_token = get_access_token()
azure_users = get_all_users_with_filter(access_token, filter_query="accountEnabled eq true")

# Format and save to DynamoDB
formatted_users = format_user_data(azure_users)
# ... process and store in database ...
```

## References

- [Microsoft Graph API - Users Endpoint](https://learn.microsoft.com/en-us/graph/api/user-list)
- [MSAL Python Documentation](https://msal-python.readthedocs.io/)
- [OData Filter Syntax](https://learn.microsoft.com/en-us/graph/query-parameters#filter-parameter)

