// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react-swc";
// import path from "path";
// import { componentTagger } from "lovable-tagger";

// // https://vitejs.dev/config/
// export default defineConfig(({ mode }) => ({
//   server: {
//     host: "::",
//     port: 8080,
//   },
//   plugins: [
//     react(),
//     mode === 'development' &&
//     componentTagger(),
//   ].filter(Boolean),
//   resolve: {
//     alias: {
//       "@": path.resolve(__dirname, "./src"),
//     },
//   },
// }));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { readFileSync } from "fs";

// Get version info
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
let gitCommitHash = 'dev';
let gitCommitDate = new Date().toISOString();

try {
  gitCommitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  gitCommitDate = execSync('git log -1 --format=%ci', { encoding: 'utf-8' }).trim();
} catch (e) {
  // Fallback if git is not available
  console.warn('Git info not available, using defaults');
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 3000,
    allowedHosts: true,
    historyApiFallback: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000", // backend service running locally
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react()  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __GIT_COMMIT__: JSON.stringify(gitCommitHash),
    __BUILD_DATE__: JSON.stringify(gitCommitDate),
  },
}));