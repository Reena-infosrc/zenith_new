import { useState, useEffect } from "react";
import axios from "axios";
import { 
  Target, 
  MessageSquare, 
  Calendar, 
  TrendingUp,
  BookOpen,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  BarChart3,
  Users,
  Star,
  Award,
  Zap,
  Search
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";

const EMPLOYEE_ID = "1"; // Replace with actual employeeId from auth/session
const API_BASE = "https://zenith-hr-api.apps.infoservices.com/api/";

export function PerformanceOverview() {
  const [showOverdueCheckIn, setShowOverdueCheckIn] = useState(true);
  const [goals, setGoals] = useState([]);
  const [employee, setEmployee] = useState<any>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<any>(null);
  const [goalForm, setGoalForm] = useState<any>({ title: "", description: "", category: "communication", file: null, completion: 0 });
  const [goalLoading, setGoalLoading] = useState(false);
  const [goalError, setGoalError] = useState("");
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeResults, setEmployeeResults] = useState<any[]>([]);
  const [selectedFeedbackEmp, setSelectedFeedbackEmp] = useState<any>(null);
  const [feedbackForm, setFeedbackForm] = useState<any>({ description: "", percent: "", category: "communication" });
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [user, setUser] = useState<any>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [employeeLoading, setEmployeeLoading] = useState(false);

  useEffect(() => {
    async function fetchUser() {
      const res = await axios.get(`${API_BASE}api/auth/me`);
      setUser(res.data);
      if (res.data.role !== "admin") {
        setSelectedEmployeeId(res.data.employeeId);
      }
    }
    fetchUser();
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) return;
    async function fetchData() {
      try {
        setEmployeeLoading(true);
        const [goalsRes, empRes] = await Promise.all([
          axios.get(`${API_BASE}api/goals/employee/${selectedEmployeeId}`),
          axios.get(`${API_BASE}api/employees/${selectedEmployeeId}`),
        ]);
        setGoals(Array.isArray(goalsRes.data) ? goalsRes.data : []);
        setEmployee(empRes.data);
      } catch (err) {
        setGoals([]);
        setEmployee(null);
      } finally {
        setEmployeeLoading(false);
      }
    }
    fetchData();
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (!user || user.role !== "admin" || searchInput.length < 2) {
      setSearchSuggestions([]);
      return;
    }
    setSearchLoading(true);
    const fetchSuggestions = async () => {
      const res = await axios.get(`${API_BASE}api/employees?search=${searchInput}`);
      setSearchSuggestions(res.data);
      setSearchLoading(false);
    };
    fetchSuggestions();
  }, [searchInput, user]);

  // Defensive: always use an array
  const safeGoals = Array.isArray(goals) ? goals : [];
  const groupedGoals = safeGoals.reduce((acc: any, goal: any) => {
    if (!acc[goal.category]) acc[goal.category] = [];
    acc[goal.category].push(goal);
    return acc;
  }, {});

  // Calculate averages
  const avg = (arr: any[]) =>
    arr.length ? arr.reduce((a, b) => a + (b.completion || 0), 0) / arr.length : 0;
  const perf_communication = avg(groupedGoals.communication || []);
  const perf_leadership = avg(groupedGoals.leadership || []);
  const perf_client_feedback = avg(groupedGoals.client_feedback || []);
  const overall_rating =
    (perf_communication + perf_leadership + perf_client_feedback) / 3;

  // Handlers for modals
  const openCreateGoal = () => {
    setEditGoal(null);
    setGoalForm({ title: "", description: "", category: "communication", file: null, completion: 0 });
    setGoalModalOpen(true);
  };
  const openEditGoal = (goal: any) => {
    setEditGoal(goal);
    setGoalForm({ title: goal.title, description: goal.description, category: goal.category, file: null, completion: goal.completion || 0 });
    setGoalModalOpen(true);
  };
  const closeGoalModal = () => {
    setGoalModalOpen(false);
    setGoalError("");
  };
  const openFeedbackModal = () => setFeedbackModalOpen(true);
  const closeFeedbackModal = () => {
    setFeedbackModalOpen(false);
    setEmployeeSearch("");
    setEmployeeResults([]);
    setSelectedFeedbackEmp(null);
    setFeedbackForm({ description: "", percent: "", category: "communication" });
    setFeedbackError("");
  };

  // Goal form handlers
  const handleGoalFormChange = (e: any) => {
    const { name, value, files, type } = e.target;
    if (type === "range") {
      setGoalForm((prev: any) => ({ ...prev, [name]: Number(value) }));
    } else {
      setGoalForm((prev: any) => ({ ...prev, [name]: files ? files[0] : value }));
    }
  };
  const handleGoalSubmit = async (e: any) => {
    e.preventDefault();
    setGoalLoading(true);
    setGoalError("");
    try {
      let payload = {
        employeeId: selectedEmployeeId,
        title: goalForm.title,
        description: goalForm.description,
        category: goalForm.category,
        completion: goalForm.completion,
      };
      // File upload placeholder (not implemented)
      if (editGoal) {
        await axios.put(`${API_BASE}api/goals/${editGoal.id}`, payload);
      } else {
        await axios.post(`${API_BASE}api/goals/`, payload);
      }
      // Refresh goals
      const goalsRes = await axios.get(`${API_BASE}api/goals/employee/${selectedEmployeeId}`);
      setGoals(Array.isArray(goalsRes.data) ? goalsRes.data : []);
      closeGoalModal();
    } catch (err: any) {
      setGoalError("Failed to save goal");
    } finally {
      setGoalLoading(false);
    }
  };

  const handleGoalDelete = async () => {
    if (!editGoal) return;
    setGoalLoading(true);
    setGoalError("");
    try {
      await axios.delete(`${API_BASE}api/goals/${editGoal.id}`);
      // Refresh goals
      const goalsRes = await axios.get(`${API_BASE}api/goals/employee/${selectedEmployeeId}`);
      setGoals(Array.isArray(goalsRes.data) ? goalsRes.data : []);
      closeGoalModal();
    } catch (err) {
      setGoalError("Failed to delete goal");
    } finally {
      setGoalLoading(false);
    }
  };

  // Feedback search handlers
  useEffect(() => {
    if (employeeSearch.length < 2) {
      setEmployeeResults([]);
      return;
    }
    const fetchEmployees = async () => {
      const res = await axios.get(`${API_BASE}api/employees?search=${employeeSearch}`);
      setEmployeeResults(res.data);
    };
    fetchEmployees();
  }, [employeeSearch]);

  // Feedback form handlers
  const handleFeedbackFormChange = (e: any) => {
    const { name, value } = e.target;
    setFeedbackForm((prev: any) => ({ ...prev, [name]: value }));
  };
  const handleFeedbackSubmit = async (e: any) => {
    e.preventDefault();
    setFeedbackLoading(true);
    setFeedbackError("");
    try {
      // Placeholder: send feedback request (implement backend as needed)
      closeFeedbackModal();
    } catch (err: any) {
      setFeedbackError("Failed to send feedback");
    } finally {
      setFeedbackLoading(false);
    }
  };

  // Tech stack logos
  const techStack = employee?.tech_stack || [];
  const strengths = employee?.strengths?.join(", ") || "-";

  // Goal Modal
  const GoalModal = () =>
    goalModalOpen ? (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <form className="bg-white p-6 rounded-xl w-full max-w-md" onSubmit={handleGoalSubmit}>
          <h2 className="text-xl font-bold mb-4">
            {editGoal ? "Edit Goal" : "Create New Goal"}
          </h2>
          <input
            className="w-full mb-2 border p-2 rounded"
            placeholder="Title"
            name="title"
            value={goalForm.title}
            onChange={handleGoalFormChange}
            required
          />
          <textarea
            className="w-full mb-2 border p-2 rounded"
            placeholder="Description"
            name="description"
            value={goalForm.description}
            onChange={handleGoalFormChange}
          />
          <select
            className="w-full mb-2 border p-2 rounded"
            name="category"
            value={goalForm.category}
            onChange={handleGoalFormChange}
          >
            <option value="communication">Communication</option>
            <option value="leadership">Leadership</option>
            <option value="client_feedback">Client Feedback</option>
          </select>
          <div className="mb-2">
            <label className="block text-sm font-medium mb-1">Completion: {goalForm.completion}%</label>
            <input
              type="range"
              name="completion"
              min={0}
              max={100}
              value={goalForm.completion}
              onChange={handleGoalFormChange}
              className="w-full"
            />
            <div className="w-full bg-gray-200 rounded h-2 mt-1">
              <div
                className="bg-teal-500 h-2 rounded"
                style={{ width: `${goalForm.completion}%` }}
              />
            </div>
          </div>
          <input type="file" className="mb-2" name="file" onChange={handleGoalFormChange} />
          {goalError && <div className="text-red-500 mb-2">{goalError}</div>}
          <div className="flex justify-between items-center space-x-2 mt-4">
            <div className="flex space-x-2">
              <Button variant="outline" type="button" onClick={closeGoalModal} disabled={goalLoading}>Cancel</Button>
              <Button type="submit" disabled={goalLoading}>{goalLoading ? "Saving..." : editGoal ? "Save" : "Create"}</Button>
            </div>
            {editGoal && (
              <Button type="button" variant="destructive" onClick={handleGoalDelete} disabled={goalLoading}>
                Delete
              </Button>
            )}
          </div>
        </form>
      </div>
    ) : null;

  // Feedback Modal
  const FeedbackModal = () =>
    feedbackModalOpen ? (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <form className="bg-white p-6 rounded-xl w-full max-w-md" onSubmit={handleFeedbackSubmit}>
          <h2 className="text-xl font-bold mb-4">Request Feedback</h2>
          <input
            className="w-full mb-2 border p-2 rounded"
            placeholder="Search employee..."
            value={employeeSearch}
            onChange={e => setEmployeeSearch(e.target.value)}
          />
          {employeeResults.length > 0 && (
            <div className="mb-2 max-h-32 overflow-y-auto border rounded">
              {employeeResults.map(emp => (
                <div
                  key={emp.id}
                  className={`p-2 cursor-pointer hover:bg-gray-100 ${selectedFeedbackEmp?.id === emp.id ? "bg-blue-100" : ""}`}
                  onClick={() => setSelectedFeedbackEmp(emp)}
                >
                  {emp.name} ({emp.position})
                </div>
              ))}
            </div>
          )}
          {selectedFeedbackEmp && (
            <div className="mb-2 p-2 border rounded bg-gray-50">
              <div className="font-semibold">{selectedFeedbackEmp.name}</div>
              <div className="text-xs text-gray-500">{selectedFeedbackEmp.position}</div>
              <div className="text-xs text-gray-500">{selectedFeedbackEmp.email}</div>
            </div>
          )}
          <textarea
            className="w-full mb-2 border p-2 rounded"
            placeholder="Feedback description"
            name="description"
            value={feedbackForm.description}
            onChange={handleFeedbackFormChange}
          />
          <input
            className="w-full mb-2 border p-2 rounded"
            placeholder="Percentage"
            type="number"
            name="percent"
            value={feedbackForm.percent}
            onChange={handleFeedbackFormChange}
          />
          <select
            className="w-full mb-2 border p-2 rounded"
            name="category"
            value={feedbackForm.category}
            onChange={handleFeedbackFormChange}
          >
            <option value="communication">Communication</option>
            <option value="leadership">Leadership</option>
            <option value="client_feedback">Client Feedback</option>
          </select>
          {feedbackError && <div className="text-red-500 mb-2">{feedbackError}</div>}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" type="button" onClick={closeFeedbackModal} disabled={feedbackLoading}>Cancel</Button>
            <Button type="submit" disabled={feedbackLoading || !selectedFeedbackEmp}>{feedbackLoading ? "Sending..." : "Send"}</Button>
          </div>
        </form>
      </div>
    ) : null;
  
  const growthRecommendations = [
    {
      title: "Leadership Excellence Program",
      type: "Course",
      duration: "6 weeks",
      match: "92%",
      icon: <Award className="w-5 h-5" />,
    },
    {
      title: "Sarah Johnson - Senior Manager",
      type: "Mentor",
      experience: "8 years",
      match: "88%",
      icon: <Users className="w-5 h-5" />,
    },
    {
      title: "Data Analytics Certification",
      type: "Certification",
      duration: "3 months",
      match: "85%",
      icon: <BarChart3 className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Admin search bar */}
      {user?.role === "admin" && (
        <div className="mb-4 relative">
          <div className="flex items-center border rounded p-2 bg-white">
            <Search className="w-5 h-5 text-gray-400 mr-2" />
            <input
              className="flex-1 outline-none"
              placeholder="Search employee by name or ID..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
          </div>
          {searchInput.length >= 2 && (
            <div className="border rounded bg-white shadow max-h-48 overflow-y-auto absolute z-50 w-full mt-1">
              {searchLoading && <div className="p-2 text-gray-500">Loading...</div>}
              {searchSuggestions.map((emp: any) => (
                <div
                  key={emp.id}
                  className={`p-2 hover:bg-gray-100 cursor-pointer ${selectedEmployeeId === emp.id ? "bg-teal-100 font-semibold" : ""}`}
                  onClick={() => {
                    setSelectedEmployeeId(emp.id);
                    setSearchInput("");
                    setSearchSuggestions([]);
                  }}
                >
                  {emp.name} ({emp.id})
                </div>
              ))}
              {!searchLoading && searchSuggestions.length === 0 && (
                <div className="p-2 text-gray-500">No results</div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Selected employee info card header */}
      {employee && (
        <div className="mb-4">
          <div className="flex items-center space-x-4 p-4 rounded-xl bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 shadow">
            <img
              src={employee.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(employee.name || "User")}`}
              alt={employee.name}
              className="w-16 h-16 rounded-full border"
            />
            <div>
              <div className="text-xl font-bold text-teal-900">{employee.name}</div>
              <div className="text-sm text-gray-700">{employee.position} | {employee.department}</div>
              <div className="text-xs text-gray-500">ID: {employee.id} | {employee.email}</div>
            </div>
          </div>
        </div>
      )}
      {employeeLoading && (
        <div className="flex justify-center items-center py-8">
          <svg className="animate-spin h-8 w-8 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
          </svg>
        </div>
      )}
      {/* For admin: only show modules if an employee is selected */}
      {user?.role === "admin" && !employee && (
        <div className="text-center text-gray-500 py-12">
          <div className="text-lg font-semibold mb-2">Search and select an employee to view performance details.</div>
          <div className="text-sm">Use the search bar above to find an employee by name or ID.</div>
        </div>
      )}
      {/* Show modules for user, or for admin if employee is selected */}
      {(user?.role !== "admin" || !!employee) && (
        <>
          {GoalModal()}
          {FeedbackModal()}
      {/* Overdue Check-in Banner */}
      {showOverdueCheckIn && (
        <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 animate-fade-in hover:shadow-lg transition-all duration-300 hover:scale-[1.01]">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-900">Time for a quick sync?</h3>
                <p className="text-sm text-amber-700">Your monthly check-in is overdue by 3 days</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowOverdueCheckIn(false)}
                className="border-amber-300 hover:bg-amber-100"
              >
                Dismiss
              </Button>
              <Button 
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Zap className="w-4 h-4 mr-2" />
                Schedule Check-In
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Smart Goals & OKRs */}
      <Card className="hover:shadow-lg transition-all duration-300 hover:scale-[1.01]">
        <CardHeader className="pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">Smart Goals & OKRs</CardTitle>
              <CardDescription>AI-powered goal setting and tracking</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Goals by category */}
                {Object.entries(groupedGoals).map(([cat, goals]: any, idx) => (
                  <div key={cat} className="p-4 rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-100">
                    <h4 className="font-semibold text-teal-900 mb-2 capitalize">{cat} Goals</h4>
              <div className="space-y-2">
                      {goals.map((goal: any) => (
                        <div key={goal.id} className="flex items-center justify-between">
                          <span className="text-sm text-teal-700">{goal.title}</span>
                          <div className="flex items-center space-x-2">
                            <Badge variant="secondary" className="bg-teal-100 text-teal-800">{goal.completion}%</Badge>
                            <Button size="sm" variant="outline" onClick={() => openEditGoal(goal)}>Edit</Button>
                          </div>
                </div>
                      ))}
                      <div className="mt-2 text-xs text-teal-800">Avg: {avg(goals).toFixed(1)}%</div>
                </div>
              </div>
                ))}
                {/* Create new goal */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-200">
                  <Button className="w-full h-24 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white border-none" onClick={openCreateGoal}>
                <div className="text-center">
                  <Target className="w-6 h-6 mx-auto mb-2" />
                  <span className="font-semibold">Create New Goal</span>
                </div>
              </Button>
            </div>
          </div>
          <div className="flex items-center space-x-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <Lightbulb className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-blue-800">
              <strong>AI Suggestion:</strong> Based on your role, consider adding "Mentor 2 junior developers" as a Q1 goal
            </span>
          </div>
        </CardContent>
      </Card>

          {/* Performance Averages */}
          <Card className="hover:shadow-lg transition-all duration-300 hover:scale-[1.01]">
            <CardHeader>
              <CardTitle>Performance Summary</CardTitle>
              <CardDescription>Category averages and overall rating</CardDescription>
            </CardHeader>
            <CardContent className="flex space-x-6">
              <div>
                <div className="font-semibold">Communication</div>
                <div>{perf_communication.toFixed(1)}%</div>
              </div>
              <div>
                <div className="font-semibold">Leadership</div>
                <div>{perf_leadership.toFixed(1)}%</div>
              </div>
              <div>
                <div className="font-semibold">Client Feedback</div>
                <div>{perf_client_feedback.toFixed(1)}%</div>
              </div>
              <div>
                <div className="font-semibold">Overall Rating</div>
                <div>{overall_rating.toFixed(1)}%</div>
              </div>
            </CardContent>
          </Card>

      {/* AI-Driven 360° Feedback */}
      <Card className="hover:shadow-lg transition-all duration-300 hover:scale-[1.01]">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">360° Feedback Hub</CardTitle>
              <CardDescription>Comprehensive feedback with AI insights</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-3">
                <Star className="w-6 h-6 text-purple-600" />
              </div>
              <h4 className="font-semibold text-purple-900 mb-1">Strengths</h4>
                  <p className="text-sm text-purple-700">{strengths}</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-100">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-6 h-6 text-amber-600" />
              </div>
                  <h4 className="font-semibold text-amber-900 mb-1">Tech Stack</h4>
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {techStack.map((tech: any) => (
                      <div key={tech.name} className="flex flex-col items-center">
                        <img src={tech.logo_url} alt={tech.name} className="w-8 h-8 mb-1" />
                        <span className="text-xs font-medium">{tech.name}</span>
                        <span className="text-xs text-gray-500">{tech.percent}%</span>
                      </div>
                    ))}
                  </div>
            </div>
            <div className="text-center p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100">
              <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
                  <h4 className="font-semibold text-green-900 mb-1">Request Feedback</h4>
                  <Button variant="outline" onClick={openFeedbackModal}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Request Feedback
            </Button>
                </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Trends */}
      <Card className="hover:shadow-lg transition-all duration-300 hover:scale-[1.01]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl">Performance Trends</CardTitle>
                <CardDescription>Year-over-year comparison</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm">
              <TrendingUp className="w-4 h-4 mr-2" />
              Toggle Comparison
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 flex items-center justify-center mb-4">
            <div className="text-center">
              <BarChart3 className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <p className="text-blue-600 font-medium">Performance Chart</p>
              <p className="text-sm text-blue-500">Interactive visualization would go here</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100">
              <div className="flex items-center space-x-3">
                <TrendingUp className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-green-900">+15%</p>
                  <p className="text-sm text-green-700">vs. last year</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100">
              <div className="flex items-center space-x-3">
                <Star className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-900">4.8/5</p>
                  <p className="text-sm text-blue-700">Current rating</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Growth Recommendations */}
      <Card className="hover:shadow-lg transition-all duration-300 hover:scale-[1.01]">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">Growth Recommendations</CardTitle>
              <CardDescription>Personalized learning & development</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {growthRecommendations.map((item, index) => (
              <div key={index} className="p-4 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-gradient-to-r hover:from-teal-50 hover:to-cyan-50 transition-all duration-300 group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 group-hover:bg-teal-100 flex items-center justify-center transition-colors duration-300">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">{item.title}</h4>
                      <div className="flex items-center space-x-4 text-sm text-slate-600">
                        <span>{item.type}</span>
                        <span>•</span>
                        <span>{item.duration || item.experience}</span>
                        <Badge variant="secondary" className="bg-teal-100 text-teal-800">
                          {item.match} match
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="group-hover:bg-teal-500 group-hover:text-white group-hover:border-teal-500 transition-all duration-300">
                    Add to Plan
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200">
            <div className="flex items-center space-x-3">
              <Lightbulb className="w-5 h-5 text-teal-600" />
              <div>
                <p className="font-semibold text-teal-900">AI Tip</p>
                <p className="text-sm text-teal-700">These recommendations are based on your last review and career goals</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
