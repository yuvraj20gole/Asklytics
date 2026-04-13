import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Navbar } from "../components/navbar";
import { User, Mail, Lock, Save, LogOut } from "lucide-react";
import { useTheme } from "../contexts/theme-context";
import { setToken } from "@/lib/auth";
import { useMotionPageEffects } from "../hooks/use-motion-page-effects";

export function Settings() {
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const titleBlockRef = useRef<HTMLDivElement>(null);
  const profileCardRef = useRef<HTMLDivElement>(null);
  const passwordCardRef = useRef<HTMLDivElement>(null);
  const preferencesCardRef = useRef<HTMLDivElement>(null);
  const sessionCardRef = useRef<HTMLDivElement>(null);

  useMotionPageEffects({
    root: rootRef,
    header: navRef,
    hero: { section: mainRef, layers: [titleBlockRef] },
    ctaBlocks: [
      profileCardRef,
      passwordCardRef,
      preferencesCardRef,
      sessionCardRef,
    ],
    parallaxInners: [{ section: rootRef, inner: mainRef }],
  });

  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  
  // Load saved data from localStorage on mount
  const [profileData, setProfileData] = useState(() => {
    const saved = localStorage.getItem("asklytics_profile");
    return saved
      ? JSON.parse(saved)
      : {
          username: "johndoe",
          email: "john.doe@company.com",
          company: "Acme Corp",
        };
  });

  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem("asklytics_preferences");
    return saved
      ? JSON.parse(saved)
      : {
          emailNotifications: true,
          saveQueryHistory: true,
        };
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [savedProfile, setSavedProfile] = useState(false);
  const [savedPassword, setSavedPassword] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    // Save to localStorage
    localStorage.setItem("asklytics_profile", JSON.stringify(profileData));
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 3000);
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate passwords match
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert("New passwords do not match!");
      return;
    }
    
    // Validate password length
    if (passwordData.newPassword.length < 6) {
      alert("Password must be at least 6 characters long!");
      return;
    }
    
    setSavedPassword(true);
    setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setTimeout(() => setSavedPassword(false), 3000);
  };

  const handleTogglePreference = (key: keyof typeof preferences) => {
    const newPreferences = { ...preferences, [key]: !preferences[key] };
    setPreferences(newPreferences);
    localStorage.setItem("asklytics_preferences", JSON.stringify(newPreferences));
  };

  const handleLogout = () => {
    setToken(null);
    try {
      localStorage.removeItem("asklytics_company");
    } catch {
      // ignore
    }
    navigate("/login", { replace: true });
  };

  return (
    <div ref={rootRef} className="min-h-screen bg-background">
      <Navbar ref={navRef} />

      <div ref={mainRef} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div ref={titleBlockRef} className="mb-8">
          <h1 className="mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account and preferences
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Settings */}
          <div
            ref={profileCardRef}
            className="bg-card border border-border rounded-xl p-6 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <h3>Profile Information</h3>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Username</label>
                <input
                  type="text"
                  value={profileData.username}
                  onChange={(e) =>
                    setProfileData({ ...profileData, username: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) =>
                      setProfileData({ ...profileData, email: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-3 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2">Company</label>
                <input
                  type="text"
                  value={profileData.company}
                  onChange={(e) =>
                    setProfileData({ ...profileData, company: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
                {savedProfile && (
                  <span className="text-secondary text-sm">Profile updated successfully!</span>
                )}
              </div>
            </form>
          </div>

          {/* Change Password */}
          <div
            ref={passwordCardRef}
            className="bg-card border border-border rounded-xl p-6 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <h3>Change Password</h3>
            </div>

            <form onSubmit={handleSavePassword} className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Current Password</label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, currentPassword: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">New Password</label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, newPassword: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="••••••••"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Update Password
                </button>
                {savedPassword && (
                  <span className="text-secondary text-sm">Password changed successfully!</span>
                )}
              </div>
            </form>
          </div>

          {/* Preferences */}
          <div
            ref={preferencesCardRef}
            className="bg-card border border-border rounded-xl p-6 shadow-sm"
          >
            <h3 className="mb-6">Preferences</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                <div>
                  <p className="font-medium mb-1">Email Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Receive email updates about your queries
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={preferences.emailNotifications}
                    onChange={() => handleTogglePreference("emailNotifications")}
                  />
                  <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                <div>
                  <p className="font-medium mb-1">Query History</p>
                  <p className="text-sm text-muted-foreground">
                    Save all queries to history
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={preferences.saveQueryHistory}
                    onChange={() => handleTogglePreference("saveQueryHistory")}
                  />
                  <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                <div>
                  <p className="font-medium mb-1">Dark Mode</p>
                  <p className="text-sm text-muted-foreground">
                    Switch to dark theme
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={theme === "dark"}
                    onChange={toggleTheme}
                  />
                  <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Session */}
          <div
            ref={sessionCardRef}
            className="bg-card border border-border rounded-xl p-6 shadow-sm"
          >
            <h3 className="mb-2">Session</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Sign out of Asklytics on this device. You will need to log in again to use the app.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-destructive/60 text-destructive bg-background hover:bg-destructive/10 transition-colors font-medium"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}