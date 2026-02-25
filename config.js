// Leave empty in most cases.
// Behavior:
// - file:// mode -> app uses http://localhost:8000 automatically
// - http(s) mode  -> app uses same origin automatically
// Set this only when frontend and backend are on different domains.
// Example:
// window.__API_BASE__ = "https://your-backend-service.onrender.com";
window.__API_BASE__ = "";
