import { BarChart3, Users, Settings, LayoutDashboard, LogOut } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { title: "Overview", icon: LayoutDashboard, path: "/dashboard" },
  { title: "Analytics", icon: BarChart3, path: "/dashboard/analytics" },
  { title: "Customers", icon: Users, path: "/dashboard/customers" },
  { title: "Settings", icon: Settings, path: "/dashboard/settings" },
];

const stats = [
  { label: "Total Revenue", value: "$45,231.89", change: "+20.1% from last month", positive: true },
  { label: "Active Users", value: "2,350", change: "+180 this week", positive: true },
  { label: "Pending Orders", value: "12", change: "-3 from yesterday", positive: false },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 font-semibold text-foreground tracking-tight">
          Acme Corp
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.title}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <button
            onClick={() => navigate("/")}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md hover:bg-secondary/50 hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-8">
          <h2 className="text-sm font-medium text-foreground">Overview</h2>
          <div className="h-8 w-8 rounded-full bg-secondary" />
        </header>

        <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-card p-6 rounded-lg shadow-card">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </p>
                <p className="text-2xl font-semibold mt-2 tabular-nums text-foreground">
                  {stat.value}
                </p>
                <p className={`text-xs mt-1 ${stat.positive ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {stat.change}
                </p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-card rounded-lg shadow-card overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="font-medium text-foreground">Recent Transactions</h3>
            </div>
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm italic">
              No recent activity found.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
