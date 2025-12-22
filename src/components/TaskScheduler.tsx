'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, Clock, Plus, Download, Trash2, Play, Pause, SkipForward, CheckCircle, CalendarDays, FileText, LogOut, Lock } from 'lucide-react';
import { getSupabase, Task, WORKSPACES } from '@/lib/supabase';

// Category color mapping
const categoryColors: Record<string, { bg: string; text: string; border: string; light: string }> = {
  'Open Opp Tasks': { bg: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-500', light: 'bg-blue-100' },
  'Internal Meeting': { bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-500', light: 'bg-purple-100' },
  'External Meeting': { bg: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-500', light: 'bg-orange-100' },
  'Meeting Follow-Up': { bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-500', light: 'bg-amber-100' },
  'Admin': { bg: 'bg-gray-500', text: 'text-gray-700', border: 'border-gray-500', light: 'bg-gray-100' },
  'Prospecting': { bg: 'bg-green-500', text: 'text-green-700', border: 'border-green-500', light: 'bg-green-100' },
  'Personal': { bg: 'bg-pink-500', text: 'text-pink-700', border: 'border-pink-500', light: 'bg-pink-100' },
};

const getCategoryColor = (category: string) => {
  return categoryColors[category] || { bg: 'bg-indigo-500', text: 'text-indigo-700', border: 'border-indigo-500', light: 'bg-indigo-100' };
};

type LocalTask = {
  id: number;
  name: string;
  duration: number;
  category: string;
  dueDate: string;
  fixedTime: string | null;
  notes: string | null;
};

type ScheduleItem = {
  task: string;
  category: string;
  start: Date;
  end: Date;
  duration: number;
  completed: boolean;
  isFixed: boolean;
  originalFixedTime?: string;
  notes: string | null;
};

export default function TaskScheduler() {
  const [allTasks, setAllTasks] = useState<LocalTask[]>([]);
  const [todaysTasks, setTodaysTasks] = useState<LocalTask[]>([]);
  const [newTask, setNewTask] = useState({ name: '', duration: '', category: '', dueDate: '', fixedTime: '', notes: '' });
  const [startTime, setStartTime] = useState('09:00');
  const [schedule, setSchedule] = useState<ScheduleItem[] | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [draggedTask, setDraggedTask] = useState<LocalTask | null>(null);
  const [draggedScheduleItem, setDraggedScheduleItem] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'upcoming' | 'past'>('today');
  const [isLoading, setIsLoading] = useState(true);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState('');

  // Timer refs for accurate countdown
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const endTimeRef = useRef<number | null>(null);

  const categories = ['Open Opp Tasks', 'Internal Meeting', 'External Meeting', 'Meeting Follow-Up', 'Admin', 'Prospecting', 'Personal'];

  // Convert database task to local format
  const dbToLocal = (task: Task): LocalTask => ({
    id: task.id,
    name: task.name,
    duration: task.duration,
    category: task.category,
    dueDate: task.due_date,
    fixedTime: task.fixed_time,
    notes: task.notes,
  });

  // Check for saved workspace on mount
  useEffect(() => {
    const savedWorkspace = localStorage.getItem('taskSchedulerWorkspace');
    if (savedWorkspace) {
      setWorkspace(savedWorkspace);
    } else {
      setIsLoading(false);
    }
  }, []);

  // Load tasks from Supabase when workspace is set
  useEffect(() => {
    if (!workspace) return;

    const loadTasks = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await getSupabase()
          .from('tasks')
          .select('*')
          .eq('workspace', workspace)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (data) {
          const localTasks = data.map(dbToLocal);
          setAllTasks(localTasks);
          loadTodaysTasks(localTasks);
        }
      } catch (error) {
        console.error('Failed to load tasks:', error);
      } finally {
        setIsLoading(false);
      }

      // Set default due date to today
      const today = new Date().toISOString().split('T')[0];
      setNewTask(prev => ({ ...prev, dueDate: today }));
    };

    loadTasks();
  }, [workspace]);

  // Handle passcode login
  const handleLogin = () => {
    const ws = WORKSPACES[passcode];
    if (ws) {
      localStorage.setItem('taskSchedulerWorkspace', ws);
      setWorkspace(ws);
      setPasscode('');
      setPasscodeError('');
    } else {
      setPasscodeError('Invalid passcode');
    }
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('taskSchedulerWorkspace');
    setWorkspace(null);
    setAllTasks([]);
    setTodaysTasks([]);
    setSchedule(null);
  };

  // Load today's tasks
  const loadTodaysTasks = (tasks: LocalTask[] = allTasks) => {
    const today = new Date().toISOString().split('T')[0];
    const filtered = tasks.filter(task => task.dueDate === today);
    setTodaysTasks(filtered);
  };

  // Get tasks grouped by date for upcoming view
  const getUpcomingTasks = () => {
    const today = new Date().toISOString().split('T')[0];
    const upcoming = allTasks.filter(task => task.dueDate >= today);

    const grouped = upcoming.reduce((acc: Record<string, LocalTask[]>, task) => {
      if (!acc[task.dueDate]) acc[task.dueDate] = [];
      acc[task.dueDate].push(task);
      return acc;
    }, {});

    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // Get past/overdue tasks
  const getPastTasks = () => {
    const today = new Date().toISOString().split('T')[0];
    const past = allTasks.filter(task => task.dueDate < today);

    const grouped = past.reduce((acc: Record<string, LocalTask[]>, task) => {
      if (!acc[task.dueDate]) acc[task.dueDate] = [];
      acc[task.dueDate].push(task);
      return acc;
    }, {});

    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
  };

  // Reschedule a task to a new date
  const rescheduleTask = async (taskId: number, newDate: string) => {
    try {
      const { error } = await getSupabase()
        .from('tasks')
        .update({ due_date: newDate })
        .eq('id', taskId);

      if (error) throw error;

      const updatedTasks = allTasks.map(task =>
        task.id === taskId ? { ...task, dueDate: newDate } : task
      );
      setAllTasks(updatedTasks);

      const today = new Date().toISOString().split('T')[0];
      if (newDate === today) {
        const task = updatedTasks.find(t => t.id === taskId);
        if (task && !todaysTasks.find(t => t.id === taskId)) {
          setTodaysTasks([...todaysTasks, task]);
        }
      }
      loadTodaysTasks(updatedTasks);
    } catch (error) {
      console.error('Failed to reschedule task:', error);
    }
  };

  // Accurate timer using timestamps
  const updateTimer = useCallback(() => {
    if (endTimeRef.current === null) return;

    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));

    setTimeRemaining(remaining);

    if (remaining <= 0) {
      playAlert();
      setIsRunning(false);
      endTimeRef.current = null;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  // Timer effect
  useEffect(() => {
    if (isRunning && endTimeRef.current !== null) {
      // Update immediately
      updateTimer();
      // Then update every 100ms for smooth display
      timerRef.current = setInterval(updateTimer, 100);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, updateTimer]);

  const playAlert = () => {
    if (typeof window === 'undefined') return;
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    [0, 0.3, 0.6].forEach(delay => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.7, audioContext.currentTime + delay);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + delay + 0.2);

      oscillator.start(audioContext.currentTime + delay);
      oscillator.stop(audioContext.currentTime + delay + 0.2);
    });
  };

  const startTask = (index: number) => {
    if (!schedule) return;
    setCurrentTaskIndex(index);
    const durationMs = schedule[index].duration * 60 * 1000;
    endTimeRef.current = Date.now() + durationMs;
    setTimeRemaining(schedule[index].duration * 60);
    setIsRunning(true);
  };

  const pauseTask = () => {
    setIsRunning(false);
    // Store remaining time when pausing
    if (endTimeRef.current !== null) {
      const remaining = Math.max(0, endTimeRef.current - Date.now());
      setTimeRemaining(Math.ceil(remaining / 1000));
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const resumeTask = () => {
    if (timeRemaining !== null && timeRemaining > 0) {
      endTimeRef.current = Date.now() + (timeRemaining * 1000);
      setIsRunning(true);
    }
  };

  const completeTask = () => {
    if (schedule === null || currentTaskIndex === null) return;

    const updatedSchedule = [...schedule];
    updatedSchedule[currentTaskIndex].completed = true;
    setSchedule(updatedSchedule);

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    endTimeRef.current = null;

    if (currentTaskIndex < schedule.length - 1) {
      startTask(currentTaskIndex + 1);
    } else {
      setCurrentTaskIndex(null);
      setTimeRemaining(null);
      setIsRunning(false);
    }
  };

  const skipTask = () => {
    if (schedule === null || currentTaskIndex === null) return;

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    endTimeRef.current = null;

    if (currentTaskIndex < schedule.length - 1) {
      startTask(currentTaskIndex + 1);
    } else {
      setCurrentTaskIndex(null);
      setTimeRemaining(null);
      setIsRunning(false);
    }
  };

  const formatTimerDisplay = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const addTask = async () => {
    if (newTask.name && newTask.duration && newTask.category && newTask.dueDate && workspace) {
      try {
        const { data, error } = await getSupabase()
          .from('tasks')
          .insert([{
            name: newTask.name,
            duration: parseInt(newTask.duration),
            category: newTask.category,
            due_date: newTask.dueDate,
            fixed_time: newTask.fixedTime || null,
            notes: newTask.notes || null,
            workspace: workspace,
          }])
          .select()
          .single();

        if (error) throw error;

        const localTask = dbToLocal(data);
        const updated = [...allTasks, localTask];
        setAllTasks(updated);

        const today = new Date().toISOString().split('T')[0];
        if (newTask.dueDate === today) {
          setTodaysTasks([...todaysTasks, localTask]);
        }

        setNewTask({ name: '', duration: '', category: '', dueDate: newTask.dueDate, fixedTime: '', notes: '' });
      } catch (error) {
        console.error('Failed to add task:', error);
      }
    }
  };

  const deleteTask = async (id: number, fromToday = false) => {
    try {
      const { error } = await getSupabase()
        .from('tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setAllTasks(allTasks.filter(task => task.id !== id));
      if (fromToday) {
        setTodaysTasks(todaysTasks.filter(task => task.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleDragStart = (e: React.DragEvent, task: LocalTask) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetTask: LocalTask) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.id === targetTask.id) return;

    const draggedIndex = todaysTasks.findIndex(t => t.id === draggedTask.id);
    const targetIndex = todaysTasks.findIndex(t => t.id === targetTask.id);

    const newTasks = [...todaysTasks];
    newTasks.splice(draggedIndex, 1);
    newTasks.splice(targetIndex, 0, draggedTask);

    setTodaysTasks(newTasks);
    setDraggedTask(null);
  };

  const handleScheduleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedScheduleItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleScheduleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleScheduleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedScheduleItem === null || draggedScheduleItem === targetIndex || !schedule) {
      setDraggedScheduleItem(null);
      return;
    }

    const draggedItem = schedule[draggedScheduleItem];

    if (draggedItem.isFixed) {
      setDraggedScheduleItem(null);
      return;
    }

    const newSchedule = [...schedule];
    newSchedule.splice(draggedScheduleItem, 1);
    newSchedule.splice(targetIndex > draggedScheduleItem ? targetIndex - 1 : targetIndex, 0, draggedItem);

    const fixedTasks = newSchedule.filter(item => item.isFixed);
    const flexibleTasks = newSchedule.filter(item => !item.isFixed);

    fixedTasks.sort((a, b) => {
      const [aHours, aMinutes] = (a.originalFixedTime || '00:00').split(':');
      const [bHours, bMinutes] = (b.originalFixedTime || '00:00').split(':');
      return (parseInt(aHours) * 60 + parseInt(aMinutes)) - (parseInt(bHours) * 60 + parseInt(bMinutes));
    });

    const finalSchedule: ScheduleItem[] = [];
    let currentTime = new Date();
    const [hours, minutes] = startTime.split(':');
    currentTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    let flexIndex = 0;
    let fixedIndex = 0;

    while (flexIndex < flexibleTasks.length || fixedIndex < fixedTasks.length) {
      if (fixedIndex < fixedTasks.length) {
        const fixedTask = fixedTasks[fixedIndex];
        const [fixedHours, fixedMinutes] = (fixedTask.originalFixedTime || '00:00').split(':');
        const fixedStartTime = new Date();
        fixedStartTime.setHours(parseInt(fixedHours), parseInt(fixedMinutes), 0, 0);

        while (flexIndex < flexibleTasks.length) {
          const flexTask = flexibleTasks[flexIndex];
          const taskEndTime = new Date(currentTime);
          taskEndTime.setMinutes(taskEndTime.getMinutes() + flexTask.duration + 5);

          if (taskEndTime > fixedStartTime) {
            break;
          }

          const startDateTime = new Date(currentTime);
          currentTime.setMinutes(currentTime.getMinutes() + flexTask.duration);
          const endDateTime = new Date(currentTime);

          finalSchedule.push({
            ...flexTask,
            start: startDateTime,
            end: endDateTime
          });

          flexIndex++;
          currentTime.setMinutes(currentTime.getMinutes() + 5);
        }

        const fixedStart = new Date(fixedStartTime);
        const fixedEnd = new Date(fixedStartTime);
        fixedEnd.setMinutes(fixedEnd.getMinutes() + fixedTask.duration);

        finalSchedule.push({
          ...fixedTask,
          start: fixedStart,
          end: fixedEnd
        });

        currentTime = new Date(fixedEnd);
        currentTime.setMinutes(currentTime.getMinutes() + 5);
        fixedIndex++;
      } else {
        while (flexIndex < flexibleTasks.length) {
          const flexTask = flexibleTasks[flexIndex];
          const startDateTime = new Date(currentTime);
          currentTime.setMinutes(currentTime.getMinutes() + flexTask.duration);
          const endDateTime = new Date(currentTime);

          finalSchedule.push({
            ...flexTask,
            start: startDateTime,
            end: endDateTime
          });

          flexIndex++;
          if (flexIndex < flexibleTasks.length) {
            currentTime.setMinutes(currentTime.getMinutes() + 5);
          }
        }
      }
    }

    finalSchedule.sort((a, b) => a.start.getTime() - b.start.getTime());

    setSchedule(finalSchedule);
    setDraggedScheduleItem(null);
  };

  const generateSchedule = () => {
    const fixedTasks = todaysTasks.filter(task => task.fixedTime);
    const flexibleTasks = todaysTasks.filter(task => !task.fixedTime);

    fixedTasks.sort((a, b) => (a.fixedTime || '').localeCompare(b.fixedTime || ''));
    flexibleTasks.sort((a, b) => a.category.localeCompare(b.category));

    const scheduleItems: ScheduleItem[] = [];
    let currentTime = new Date();
    const [hours, minutes] = startTime.split(':');
    currentTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    let flexIndex = 0;
    let fixedIndex = 0;

    while (flexIndex < flexibleTasks.length || fixedIndex < fixedTasks.length) {
      if (fixedIndex < fixedTasks.length) {
        const fixedTask = fixedTasks[fixedIndex];
        const [fixedHours, fixedMinutes] = (fixedTask.fixedTime || '00:00').split(':');
        const fixedDateTime = new Date();
        fixedDateTime.setHours(parseInt(fixedHours), parseInt(fixedMinutes), 0, 0);

        const availableMinutes = (fixedDateTime.getTime() - currentTime.getTime()) / (1000 * 60);

        if (availableMinutes >= 10 && flexIndex < flexibleTasks.length) {
          while (flexIndex < flexibleTasks.length) {
            const flexTask = flexibleTasks[flexIndex];
            const taskEndTime = new Date(currentTime);
            taskEndTime.setMinutes(taskEndTime.getMinutes() + flexTask.duration + 5);

            if (taskEndTime > fixedDateTime) {
              break;
            }

            const startDateTime = new Date(currentTime);
            currentTime.setMinutes(currentTime.getMinutes() + flexTask.duration);
            const endDateTime = new Date(currentTime);

            scheduleItems.push({
              task: flexTask.name,
              category: flexTask.category,
              start: startDateTime,
              end: endDateTime,
              duration: flexTask.duration,
              completed: false,
              isFixed: false,
              notes: flexTask.notes,
            });

            flexIndex++;

            const nextTaskTime = new Date(currentTime);
            nextTaskTime.setMinutes(nextTaskTime.getMinutes() + 5);
            if (nextTaskTime < fixedDateTime && flexIndex < flexibleTasks.length) {
              currentTime = nextTaskTime;
            }
          }
        }

        const startDateTime = new Date(fixedDateTime);
        const endDateTime = new Date(fixedDateTime);
        endDateTime.setMinutes(endDateTime.getMinutes() + fixedTask.duration);

        scheduleItems.push({
          task: fixedTask.name,
          category: fixedTask.category,
          start: startDateTime,
          end: endDateTime,
          duration: fixedTask.duration,
          completed: false,
          isFixed: true,
          originalFixedTime: fixedTask.fixedTime || undefined,
          notes: fixedTask.notes,
        });

        currentTime = new Date(endDateTime);
        currentTime.setMinutes(currentTime.getMinutes() + 5);
        fixedIndex++;
      } else {
        while (flexIndex < flexibleTasks.length) {
          const flexTask = flexibleTasks[flexIndex];
          const startDateTime = new Date(currentTime);
          currentTime.setMinutes(currentTime.getMinutes() + flexTask.duration);
          const endDateTime = new Date(currentTime);

          scheduleItems.push({
            task: flexTask.name,
            category: flexTask.category,
            start: startDateTime,
            end: endDateTime,
            duration: flexTask.duration,
            completed: false,
            isFixed: false,
            notes: flexTask.notes,
          });

          flexIndex++;
          if (flexIndex < flexibleTasks.length) {
            currentTime.setMinutes(currentTime.getMinutes() + 5);
          }
        }
      }
    }

    scheduleItems.sort((a, b) => a.start.getTime() - b.start.getTime());

    setSchedule(scheduleItems);
    setCurrentTaskIndex(null);
    setTimeRemaining(null);
    setIsRunning(false);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(date);

    const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const generateICS = () => {
    if (!schedule) return;

    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Task Scheduler//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    schedule.forEach((item, index) => {
      icsContent.push(
        'BEGIN:VEVENT',
        `UID:${Date.now()}-${index}@taskscheduler`,
        `DTSTAMP:${formatICSDate(new Date())}`,
        `DTSTART:${formatICSDate(item.start)}`,
        `DTEND:${formatICSDate(item.end)}`,
        `SUMMARY:${item.task}`,
        `DESCRIPTION:Category: ${item.category}${item.notes ? `\\nNotes: ${item.notes}` : ''}`,
        `CATEGORIES:${item.category}`,
        'END:VEVENT'
      );
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `daily-schedule-${new Date().toISOString().split('T')[0]}.ics`;
    link.click();
  };

  const totalTime = todaysTasks.reduce((sum, task) => sum + task.duration, 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-xl text-indigo-600">Loading tasks...</div>
      </div>
    );
  }

  // Login screen
  if (!workspace) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
              <Lock size={32} className="text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Task Scheduler</h1>
            <p className="text-gray-500 mt-2">Enter your passcode to continue</p>
          </div>

          <div className="space-y-4">
            <div>
              <input
                type="password"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  setPasscodeError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center text-xl tracking-widest"
                placeholder="Enter passcode"
                autoFocus
              />
              {passcodeError && (
                <p className="text-red-500 text-sm mt-2 text-center">{passcodeError}</p>
              )}
            </div>

            <button
              onClick={handleLogin}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-indigo-900 mb-2 flex items-center justify-center gap-3">
            <Calendar size={40} />
            Task Scheduler
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${
              workspace === 'work'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-pink-100 text-pink-700'
            }`}>
              {workspace === 'work' ? 'Work' : 'Personal'}
            </span>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-gray-700 p-1 transition"
              title="Switch workspace"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={() => setViewMode('past')}
            className={`px-6 py-2 rounded-lg font-medium transition ${
              viewMode === 'past'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-indigo-600 hover:bg-indigo-50'
            }`}
          >
            Past Tasks {getPastTasks().length > 0 && `(${getPastTasks().reduce((sum, [, tasks]) => sum + tasks.length, 0)})`}
          </button>
          <button
            onClick={() => setViewMode('today')}
            className={`px-6 py-2 rounded-lg font-medium transition ${
              viewMode === 'today'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-indigo-600 hover:bg-indigo-50'
            }`}
          >
            Today&apos;s Tasks
          </button>
          <button
            onClick={() => setViewMode('upcoming')}
            className={`px-6 py-2 rounded-lg font-medium transition ${
              viewMode === 'upcoming'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-indigo-600 hover:bg-indigo-50'
            }`}
          >
            Upcoming Tasks
          </button>
        </div>

        {/* Current Task Focus */}
        {currentTaskIndex !== null && schedule && (
          <div className={`${getCategoryColor(schedule[currentTaskIndex].category).bg} text-white rounded-xl shadow-2xl p-8 mb-6`}>
            <div className="text-center">
              <div className="text-sm font-medium mb-2 opacity-90">CURRENT TASK</div>
              <h2 className="text-3xl font-bold mb-4">{schedule[currentTaskIndex].task}</h2>
              <div className="text-6xl font-bold mb-6 font-mono">
                {formatTimerDisplay(timeRemaining || 0)}
              </div>

              {/* Notes Section - Only shown in focus mode */}
              {schedule[currentTaskIndex].notes && (
                <div className="bg-white/20 rounded-lg p-4 mb-6 max-w-xl mx-auto">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2 opacity-90">
                    <FileText size={16} />
                    NOTES
                  </div>
                  <p className="text-white/95 text-left whitespace-pre-wrap">
                    {schedule[currentTaskIndex].notes}
                  </p>
                </div>
              )}

              <div className="flex justify-center gap-4 mb-4">
                {isRunning ? (
                  <button
                    onClick={pauseTask}
                    className="bg-white text-gray-800 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition flex items-center gap-2"
                  >
                    <Pause size={24} />
                    Pause
                  </button>
                ) : timeRemaining && timeRemaining > 0 ? (
                  <button
                    onClick={resumeTask}
                    className="bg-white text-gray-800 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition flex items-center gap-2"
                  >
                    <Play size={24} />
                    Resume
                  </button>
                ) : null}
                <button
                  onClick={completeTask}
                  className="bg-white text-gray-800 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition flex items-center gap-2"
                >
                  <CheckCircle size={24} />
                  Complete
                </button>
                <button
                  onClick={skipTask}
                  className="bg-white/20 text-white px-6 py-4 rounded-lg font-bold text-lg hover:bg-white/30 transition flex items-center gap-2"
                >
                  <SkipForward size={24} />
                  Skip
                </button>
              </div>
              <div className="text-sm opacity-90">
                Category: {schedule[currentTaskIndex].category} |
                Task {currentTaskIndex + 1} of {schedule.length}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'today' ? (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left Column - Task Input */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Add Tasks</h2>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
                  <input
                    type="text"
                    value={newTask.name}
                    onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="What needs to be done?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    value={newTask.duration}
                    onChange={(e) => setNewTask({ ...newTask, duration: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="30"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={newTask.category}
                    onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select category...</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fixed Time <span className="text-gray-500 text-xs">(optional - for meetings, etc.)</span>
                  </label>
                  <input
                    type="time"
                    value={newTask.fixedTime}
                    onChange={(e) => setNewTask({ ...newTask, fixedTime: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes <span className="text-gray-500 text-xs">(shown in focus mode)</span>
                  </label>
                  <textarea
                    value={newTask.notes}
                    onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Add any notes or details for this task..."
                    rows={3}
                  />
                </div>

                <button
                  onClick={addTask}
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                >
                  <Plus size={20} />
                  Add Task
                </button>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-800 mb-3">Today&apos;s Tasks ({todaysTasks.length})</h3>
                {todaysTasks.length === 0 ? (
                  <p className="text-gray-500 text-sm">No tasks for today. Add one above!</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {todaysTasks.map(task => {
                      const colors = getCategoryColor(task.category);
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, task)}
                          className={`flex items-center justify-between p-3 rounded-lg cursor-move hover:opacity-80 transition border-l-4 ${colors.border} ${colors.light}`}
                        >
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 flex items-center gap-2">
                              {task.name}
                              {task.fixedTime && (
                                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                                  @ {task.fixedTime}
                                </span>
                              )}
                              {task.notes && (
                                <FileText size={14} className="text-gray-400" />
                              )}
                            </div>
                            <div className="text-sm text-gray-600">
                              <span className={`inline-block ${colors.light} ${colors.text} px-2 py-0.5 rounded mr-2`}>
                                {task.category}
                              </span>
                              {task.duration} min
                            </div>
                          </div>
                          <button
                            onClick={() => deleteTask(task.id, true)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {todaysTasks.length > 0 && (
                  <div className="mt-3 text-sm text-gray-600 flex items-center gap-2">
                    <Clock size={16} />
                    Total time: {totalTime} minutes ({Math.floor(totalTime / 60)}h {totalTime % 60}m)
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Schedule */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Your Schedule</h2>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <button
                onClick={generateSchedule}
                disabled={todaysTasks.length === 0}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed mb-4"
              >
                Generate Schedule
              </button>

              {schedule && (
                <>
                  <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                    {schedule.map((item, index) => {
                      const colors = getCategoryColor(item.category);
                      return (
                        <div
                          key={index}
                          draggable={!item.isFixed && currentTaskIndex !== index}
                          onDragStart={(e) => !item.isFixed && handleScheduleDragStart(e, index)}
                          onDragOver={handleScheduleDragOver}
                          onDrop={(e) => handleScheduleDrop(e, index)}
                          className={`border-l-4 p-4 rounded-r-lg transition ${
                            item.completed
                              ? 'border-green-500 bg-green-50 opacity-60'
                              : currentTaskIndex === index
                              ? `${colors.border} ${colors.light} ring-2 ring-offset-1`
                              : item.isFixed
                              ? 'border-orange-500 bg-orange-50'
                              : `${colors.border} ${colors.light} cursor-move hover:opacity-80`
                          } ${draggedScheduleItem === index ? 'opacity-50' : ''}`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                              {item.completed && <CheckCircle size={18} className="text-green-600" />}
                              {item.isFixed && <span className="text-orange-600">@</span>}
                              <div className={`font-semibold ${item.completed ? 'line-through text-gray-600' : 'text-gray-900'}`}>
                                {item.task}
                              </div>
                              {item.notes && <FileText size={14} className="text-gray-400" />}
                            </div>
                            <span className={`text-xs px-2 py-1 rounded ${colors.light} ${colors.text}`}>
                              {item.category}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mb-2">
                            {formatTime(item.start)} - {formatTime(item.end)} ({item.duration} min)
                            {item.isFixed && <span className="ml-2 text-orange-600 font-medium">Fixed Time</span>}
                          </div>
                          {!item.completed && currentTaskIndex !== index && (
                            <button
                              onClick={() => startTask(index)}
                              className={`text-sm ${colors.bg} text-white px-3 py-1 rounded hover:opacity-80 transition flex items-center gap-1`}
                            >
                              <Play size={14} />
                              Start
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={generateICS}
                    className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                  >
                    <Download size={20} />
                    Download for Outlook (.ics)
                  </button>
                </>
              )}

              {!schedule && todaysTasks.length > 0 && (
                <p className="text-gray-500 text-sm text-center mt-8">
                  Click &quot;Generate Schedule&quot; to see your organized day
                </p>
              )}
            </div>
          </div>
        ) : viewMode === 'past' ? (
          /* Past Tasks View */
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <CalendarDays size={28} />
              Past Tasks
            </h2>

            {getPastTasks().length === 0 ? (
              <p className="text-gray-500 text-center py-8">No past tasks - you&apos;re all caught up!</p>
            ) : (
              <div className="space-y-6">
                {getPastTasks().map(([date, tasks]) => (
                  <div key={date} className="border-b pb-4 last:border-b-0">
                    <h3 className="text-lg font-semibold text-red-700 mb-3">
                      {formatDate(date)} - Overdue
                    </h3>
                    <div className="space-y-2">
                      {tasks.map(task => {
                        const colors = getCategoryColor(task.category);
                        return (
                          <div key={task.id} className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${colors.border} bg-red-50`}>
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 flex items-center gap-2">
                                {task.name}
                                {task.fixedTime && (
                                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                                    @ {task.fixedTime}
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600">
                                <span className={`inline-block ${colors.light} ${colors.text} px-2 py-0.5 rounded mr-2`}>
                                  {task.category}
                                </span>
                                {task.duration} min
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  const today = new Date().toISOString().split('T')[0];
                                  rescheduleTask(task.id, today);
                                }}
                                className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 transition"
                              >
                                Today
                              </button>
                              <button
                                onClick={() => {
                                  const tomorrow = new Date();
                                  tomorrow.setDate(tomorrow.getDate() + 1);
                                  rescheduleTask(task.id, tomorrow.toISOString().split('T')[0]);
                                }}
                                className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition"
                              >
                                Tomorrow
                              </button>
                              <button
                                onClick={() => deleteTask(task.id)}
                                className="text-red-500 hover:text-red-700 p-1"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Upcoming Tasks View */
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <CalendarDays size={28} />
              Upcoming Tasks
            </h2>

            {getUpcomingTasks().length === 0 ? (
              <p className="text-gray-500 text-center py-8">No upcoming tasks scheduled</p>
            ) : (
              <div className="space-y-6">
                {getUpcomingTasks().map(([date, tasks]) => (
                  <div key={date} className="border-b pb-4 last:border-b-0">
                    <h3 className="text-lg font-semibold text-indigo-900 mb-3">
                      {formatDate(date)}
                    </h3>
                    <div className="space-y-2">
                      {tasks.map(task => {
                        const colors = getCategoryColor(task.category);
                        return (
                          <div key={task.id} className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${colors.border} ${colors.light}`}>
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 flex items-center gap-2">
                                {task.name}
                                {task.fixedTime && (
                                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                                    @ {task.fixedTime}
                                  </span>
                                )}
                                {task.notes && (
                                  <FileText size={14} className="text-gray-400" />
                                )}
                              </div>
                              <div className="text-sm text-gray-600">
                                <span className={`inline-block ${colors.light} ${colors.text} px-2 py-0.5 rounded mr-2`}>
                                  {task.category}
                                </span>
                                {task.duration} min
                              </div>
                            </div>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
