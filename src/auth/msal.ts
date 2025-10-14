import { PublicClientApplication, type Configuration } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "84857ef6-8b76-45f8-8be1-877af61283fc",
    authority: "https://login.microsoftonline.com/97c30056-8614-4cfa-a2a6-8f3f9e29de81",
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);


