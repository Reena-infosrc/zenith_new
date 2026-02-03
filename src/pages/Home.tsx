import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { FeedCard } from "@/components/FeedCard";
import { 
  Users, 
  Calendar, 
  UserPlus, 
  Share2, 
  BarChart2,
  MessageSquare,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<string>("Home");
  const [loading, setLoading] = useState(false);
  const [feedPage, setFeedPage] = useState(1);
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  
  // Simulate loading more feed items
  const loadMoreFeed = () => {
    setLoading(true);
    setTimeout(() => {
      setFeedPage(prev => prev + 1);
      setLoading(false);
    }, 1500);
  };
  
  // Feed data
  const feedItems = [
    {
      author: "HR AI Assistant",
      timestamp: "Just now",
      content: "Good morning! 👋 Today's focus: 3 pending approvals for PTO requests. Employee engagement is up 12% this week - great job team!",
      likes: 5,
      comments: 2,
      authorPhoto: "https://images.unsplash.com/photo-1536548665027-b96d34a005ae?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80"
    },
    {
      author: "System",
      timestamp: "2 hours ago",
      content: "New company policy update: Remote work guidelines have been updated. Please review the changes by end of day.",
      likes: 12,
      comments: 8
    },
    {
      author: "Sarah Johnson",
      timestamp: "Yesterday",
      content: "I'm excited to announce that our team exceeded Q1 goals by 15%! Great work everyone! 🎉",
      likes: 24,
      comments: 5,
      authorPhoto: "https://images.unsplash.com/photo-1503185912284-5271ff81b9a8?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80"
    }
  ];
  
  // Birthday data with photos
  const birthdays = [
    { 
      name: "Sarah Johnson", 
      date: "Today", 
      type: "birthday", 
      photo: "https://images.unsplash.com/photo-1503185912284-5271ff81b9a8?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80" 
    },
    { 
      name: "Michael Chen", 
      date: "Tomorrow", 
      type: "birthday",
      photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80"  
    },
    { 
      name: "Emma Wilson", 
      date: "May 15", 
      type: "birthday",
      photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80" 
    },
  ];

  // Work anniversary data with photos
  const anniversaries = [
    { 
      name: "David Brown", 
      date: "Today - 3 years", 
      type: "anniversary", 
      details: "Software Engineer",
      photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80" 
    },
    { 
      name: "Lisa Taylor", 
      date: "May 18 - 5 years", 
      type: "anniversary", 
      details: "HR Manager",
      photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80" 
    },
  ];

  // Event data
  const events = [
    { 
      name: "Team Building", 
      date: "May 20", 
      type: "event", 
      details: "Central Park, 2:00 PM",
      photo: "/event-team-building.jpg"
    },
    { 
      name: "Quarterly Review", 
      date: "May 25", 
      type: "event",
      photo: "/event-quarterly-review.jpg"
    },
    { 
      name: "New Product Launch", 
      date: "June 1", 
      type: "event",
      photo: "/event-product-launch.jpg" 
    },
  ];

  // New team members data with photos
  const newMembers = [
    {
      name: "Alex Johnson",
      position: "Developer",
      startDate: "Started today",
      photo: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80"
    },
    {
      name: "Maria Perez",
      position: "Designer",
      startDate: "Started yesterday",
      photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80"
    }
  ];
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header onMenuToggle={toggleSidebar} />
      
      {/* Main Layout */}
      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* Left Sidebar - Always Fixed */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-56 sidebar-glass transform transition-transform duration-300 ease-in-out flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}>
          <SidebarContent 
            activeModule={activeModule} 
            onModuleChange={setActiveModule} 
          />
        </aside>
        
        {/* Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-10 lg:hidden"
            onClick={toggleSidebar}
          />
        )}
        
        {/* Main Content - Account for fixed sidebar and header */}
        <main className="flex-1 lg:ml-64 pt-16">
          <div className="container px-4 py-6">
            {/* Welcome Section */}
            <section className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Welcome back, John!</h1>
              <p className="text-muted-foreground">Here's what's happening in your organization today.</p>
            </section>
            
            {/* Search for Mobile */}
            <div className="mb-6 md:hidden">
              <div className="relative">
                <Input placeholder="Search..." className="w-full pl-9" />
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                </div>
              </div>
            </div>
            
            {/* Two-Column Layout for Feed and Quick Look */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Feed */}
              <div className="lg:col-span-2">
                <h2 className="text-lg font-medium mb-4">Activity Feed</h2>
                
                <div className="mb-4">
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-border">
                    <div className="flex items-center mb-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-hr-primary text-white flex items-center justify-center mr-3">
                        J
                      </div>
                      <Input placeholder="Share an update with your team..." className="bg-muted/50" />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm">Post</Button>
                    </div>
                  </div>
                </div>
                
                {/* Feed Items */}
                {Array(feedPage).fill(0).map((_, pageIndex) => (
                  feedItems.map((item, index) => (
                    <FeedCard 
                      key={`${pageIndex}-${index}`}
                      author={item.author}
                      timestamp={item.timestamp}
                      content={pageIndex === 0 ? item.content : `Update ${pageIndex+1}: ${item.content}`}
                      likes={item.likes + (pageIndex * 3)}
                      comments={item.comments + pageIndex}
                      authorPhoto={item.authorPhoto}
                      className="animation-delay-200 mb-4"
                    />
                  ))
                ))}
                
                {/* Load More Button */}
                <div className="flex justify-center my-6">
                  <Button 
                    variant="outline" 
                    onClick={loadMoreFeed}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Right Column - Quick Look */}
              <div>
                <h2 className="text-lg font-medium mb-4">Quick Look</h2>
                
                {/* Today's Stats Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-border mb-6">
                  <h3 className="font-medium mb-2">Today's Stats</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/30 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">Employees</p>
                      <p className="text-2xl font-semibold">1,234</p>
                    </div>
                    <div className="bg-muted/30 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">Active Projects</p>
                      <p className="text-2xl font-semibold">42</p>
                    </div>
                  </div>
                </div>
                
                {/* Birthdays Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-border mb-6">
                  <h3 className="font-medium mb-3">Birthdays</h3>
                  <div className="space-y-3">
                    {birthdays.map((person, index) => (
                      <div key={index} className="flex items-center">
                        {person.photo ? (
                          <img 
                            src={person.photo} 
                            alt={person.name} 
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-hr-primary text-white flex items-center justify-center">
                            {person.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        )}
                        <div className="ml-3">
                          <p className="text-sm font-medium">{person.name}</p>
                          <p className="text-xs text-muted-foreground">{person.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Work Anniversaries Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-border mb-6">
                  <h3 className="font-medium mb-3">Work Anniversaries</h3>
                  <div className="space-y-3">
                    {anniversaries.map((person, index) => (
                      <div key={index} className="flex items-center">
                        {person.photo ? (
                          <img 
                            src={person.photo} 
                            alt={person.name} 
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-hr-secondary text-white flex items-center justify-center">
                            {person.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        )}
                        <div className="ml-3">
                          <p className="text-sm font-medium">{person.name}</p>
                          <p className="text-xs text-muted-foreground">{person.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Upcoming Events Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-border mb-6">
                  <h3 className="font-medium mb-3">Upcoming Events</h3>
                  <div className="space-y-3">
                    {events.map((event, index) => (
                      <div key={index} className="flex items-center">
                        {event.photo && !event.photo.startsWith('/') ? (
                          <img 
                            src={event.photo} 
                            alt={event.name} 
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-hr-primary text-white flex items-center justify-center">
                            <Calendar className="h-4 w-4" />
                          </div>
                        )}
                        <div className="ml-3">
                          <p className="text-sm font-medium">{event.name}</p>
                          <p className="text-xs text-muted-foreground">{event.date} {event.details ? `- ${event.details}` : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* New Team Members Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-border mb-6">
                  <h3 className="font-medium mb-3">New Team Members</h3>
                  <div className="space-y-3">
                    {newMembers.map((member, index) => (
                      <div key={index} className="flex items-center">
                        {member.photo ? (
                          <img 
                            src={member.photo} 
                            alt={member.name} 
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-hr-secondary text-white flex items-center justify-center">
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        )}
                        <div className="ml-3">
                          <p className="text-sm font-medium">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.position} - {member.startDate}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Quick Links Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-border mb-6">
                  <h3 className="font-medium mb-2">Quick Links</h3>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start">
                      <Calendar className="mr-2 h-4 w-4" />
                      Request Time Off
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <UserPlus className="mr-2 h-4 w-4" />
                      Refer a Candidate
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <BarChart2 className="mr-2 h-4 w-4" />
                      View Reports
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
