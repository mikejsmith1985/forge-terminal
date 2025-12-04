import React, { useState } from 'react';
import {
  // Development & Code
  Terminal, Code, Code2, Braces, FileCode, FileCode2, GitBranch, GitCommit, 
  GitMerge, GitPullRequest, Github, Gitlab, Bug, Puzzle, Blocks, Box, Boxes,
  Package, Layers, Database, Server, Cloud, CloudUpload, CloudDownload,
  
  // Actions & Controls  
  Play, PlayCircle, Pause, Square, RotateCcw, RefreshCw, Zap, Rocket,
  Send, Upload, Download, Save, Copy, Clipboard, ClipboardCheck,
  
  // Files & Folders
  File, FileText, Files, Folder, FolderOpen, FolderGit, Archive,
  
  // Tools & Settings
  Settings, Wrench, Hammer, Cog, SlidersHorizontal, Filter, Search,
  
  // Communication
  MessageSquare, MessageCircle, Mail, Bell, Megaphone,
  
  // AI & Robots
  Bot, Cpu, Brain, Sparkles, Wand2, Stars,
  
  // System & Hardware
  Monitor, Laptop, Smartphone, HardDrive, Wifi, Globe, Link,
  
  // Security
  Lock, Unlock, Key, Shield, ShieldCheck,
  
  // Misc
  Home, User, Users, Star, Heart, Bookmark, Tag, Flag, 
  AlertTriangle, AlertCircle, Info, HelpCircle, CheckCircle, XCircle,
  Clock, Calendar, Timer, Activity, BarChart, PieChart, TrendingUp,
  Trash2, Edit, Eye, EyeOff, Power, LogOut, ExternalLink,
  
  // Arrows & Navigation
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronRight, CornerDownRight,
  
  // Nature & Fun
  Flame, Leaf, Sun, Moon, Coffee, Pizza, Music, Gamepad2, Trophy
} from 'lucide-react';

// Icon definitions with categories
const iconCategories = {
  'AI & Automation': [
    { name: 'Bot', icon: Bot, label: 'Robot/Bot' },
    { name: 'Cpu', icon: Cpu, label: 'CPU' },
    { name: 'Brain', icon: Brain, label: 'Brain/AI' },
    { name: 'Sparkles', icon: Sparkles, label: 'Sparkles' },
    { name: 'Wand2', icon: Wand2, label: 'Magic Wand' },
    { name: 'Stars', icon: Stars, label: 'Stars' },
    { name: 'Zap', icon: Zap, label: 'Lightning' },
  ],
  'Development': [
    { name: 'Terminal', icon: Terminal, label: 'Terminal' },
    { name: 'Code', icon: Code, label: 'Code' },
    { name: 'Code2', icon: Code2, label: 'Code 2' },
    { name: 'Braces', icon: Braces, label: 'Braces' },
    { name: 'FileCode', icon: FileCode, label: 'File Code' },
    { name: 'Bug', icon: Bug, label: 'Bug' },
    { name: 'Puzzle', icon: Puzzle, label: 'Puzzle' },
    { name: 'Blocks', icon: Blocks, label: 'Blocks' },
  ],
  'Git & Version Control': [
    { name: 'GitBranch', icon: GitBranch, label: 'Git Branch' },
    { name: 'GitCommit', icon: GitCommit, label: 'Git Commit' },
    { name: 'GitMerge', icon: GitMerge, label: 'Git Merge' },
    { name: 'GitPullRequest', icon: GitPullRequest, label: 'Pull Request' },
    { name: 'Github', icon: Github, label: 'GitHub' },
    { name: 'Gitlab', icon: Gitlab, label: 'GitLab' },
  ],
  'Infrastructure': [
    { name: 'Server', icon: Server, label: 'Server' },
    { name: 'Database', icon: Database, label: 'Database' },
    { name: 'Cloud', icon: Cloud, label: 'Cloud' },
    { name: 'CloudUpload', icon: CloudUpload, label: 'Cloud Upload' },
    { name: 'CloudDownload', icon: CloudDownload, label: 'Cloud Download' },
    { name: 'Package', icon: Package, label: 'Package' },
    { name: 'Layers', icon: Layers, label: 'Layers' },
    { name: 'Box', icon: Box, label: 'Box' },
  ],
  'Actions': [
    { name: 'Play', icon: Play, label: 'Play' },
    { name: 'PlayCircle', icon: PlayCircle, label: 'Play Circle' },
    { name: 'Rocket', icon: Rocket, label: 'Rocket' },
    { name: 'Send', icon: Send, label: 'Send' },
    { name: 'RefreshCw', icon: RefreshCw, label: 'Refresh' },
    { name: 'RotateCcw', icon: RotateCcw, label: 'Undo' },
    { name: 'Download', icon: Download, label: 'Download' },
    { name: 'Upload', icon: Upload, label: 'Upload' },
  ],
  'Files': [
    { name: 'File', icon: File, label: 'File' },
    { name: 'FileText', icon: FileText, label: 'File Text' },
    { name: 'Folder', icon: Folder, label: 'Folder' },
    { name: 'FolderOpen', icon: FolderOpen, label: 'Folder Open' },
    { name: 'FolderGit', icon: FolderGit, label: 'Git Folder' },
    { name: 'Archive', icon: Archive, label: 'Archive' },
    { name: 'Save', icon: Save, label: 'Save' },
    { name: 'Copy', icon: Copy, label: 'Copy' },
  ],
  'Tools': [
    { name: 'Settings', icon: Settings, label: 'Settings' },
    { name: 'Wrench', icon: Wrench, label: 'Wrench' },
    { name: 'Hammer', icon: Hammer, label: 'Hammer' },
    { name: 'Search', icon: Search, label: 'Search' },
    { name: 'Filter', icon: Filter, label: 'Filter' },
    { name: 'SlidersHorizontal', icon: SlidersHorizontal, label: 'Sliders' },
    { name: 'Edit', icon: Edit, label: 'Edit' },
    { name: 'Trash2', icon: Trash2, label: 'Delete' },
  ],
  'Status': [
    { name: 'CheckCircle', icon: CheckCircle, label: 'Success' },
    { name: 'XCircle', icon: XCircle, label: 'Error' },
    { name: 'AlertTriangle', icon: AlertTriangle, label: 'Warning' },
    { name: 'AlertCircle', icon: AlertCircle, label: 'Alert' },
    { name: 'Info', icon: Info, label: 'Info' },
    { name: 'ShieldCheck', icon: ShieldCheck, label: 'Secure' },
    { name: 'Activity', icon: Activity, label: 'Activity' },
    { name: 'Clock', icon: Clock, label: 'Clock' },
  ],
  'Fun': [
    { name: 'Flame', icon: Flame, label: 'Fire' },
    { name: 'Coffee', icon: Coffee, label: 'Coffee' },
    { name: 'Star', icon: Star, label: 'Star' },
    { name: 'Heart', icon: Heart, label: 'Heart' },
    { name: 'Trophy', icon: Trophy, label: 'Trophy' },
    { name: 'Gamepad2', icon: Gamepad2, label: 'Game' },
    { name: 'Music', icon: Music, label: 'Music' },
    { name: 'Moon', icon: Moon, label: 'Moon' },
  ],
};

// Map icon names to components for rendering saved icons
export const iconMap = {
  Bot, Cpu, Brain, Sparkles, Wand2, Stars, Zap,
  Terminal, Code, Code2, Braces, FileCode, FileCode2, Bug, Puzzle, Blocks,
  GitBranch, GitCommit, GitMerge, GitPullRequest, Github, Gitlab,
  Server, Database, Cloud, CloudUpload, CloudDownload, Package, Layers, Box, Boxes,
  Play, PlayCircle, Pause, Square, RotateCcw, RefreshCw, Rocket, Send, Upload, Download, Save, Copy, Clipboard, ClipboardCheck,
  File, FileText, Files, Folder, FolderOpen, FolderGit, Archive,
  Settings, Wrench, Hammer, Cog, SlidersHorizontal, Filter, Search, Edit, Trash2,
  CheckCircle, XCircle, AlertTriangle, AlertCircle, Info, ShieldCheck, Activity, Clock,
  Flame, Coffee, Star, Heart, Trophy, Gamepad2, Music, Moon,
  MessageSquare, MessageCircle, Mail, Bell, Megaphone,
  Monitor, Laptop, Smartphone, HardDrive, Wifi, Globe, Link,
  Lock, Unlock, Key, Shield,
  Home, User, Users, Bookmark, Tag, Flag, Calendar, Timer, BarChart, PieChart, TrendingUp,
  Eye, EyeOff, Power, LogOut, ExternalLink,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronRight, CornerDownRight,
  Leaf, Sun, Pizza,
};

const IconPicker = ({ selectedIcon, onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = useState('AI & Automation');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter icons based on search
  const getFilteredIcons = () => {
    if (!searchTerm) {
      return iconCategories[activeCategory] || [];
    }
    
    const allIcons = Object.values(iconCategories).flat();
    return allIcons.filter(icon => 
      icon.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      icon.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filteredIcons = getFilteredIcons();

  return (
    <div className="icon-picker">
      <div className="icon-picker-header">
        <input
          type="text"
          placeholder="Search icons..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="icon-search"
        />
      </div>

      {!searchTerm && (
        <div className="icon-categories">
          {Object.keys(iconCategories).map(category => (
            <button
              key={category}
              className={`category-btn ${activeCategory === category ? 'active' : ''}`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      <div className="icon-grid">
        <button
          className={`icon-option ${!selectedIcon ? 'selected' : ''}`}
          onClick={() => onSelect(null)}
          title="No icon"
        >
          <span style={{ color: '#666' }}>∅</span>
        </button>
        {filteredIcons.map(({ name, icon: Icon, label }) => (
          <button
            key={name}
            className={`icon-option ${selectedIcon === name ? 'selected' : ''}`}
            onClick={() => onSelect(name)}
            title={label}
          >
            <Icon size={20} />
          </button>
        ))}
      </div>
    </div>
  );
};

export default IconPicker;
