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
  'Emoji': [
    { name: 'emoji-robot', icon: null, label: 'Robot', emoji: '🤖' },
    { name: 'emoji-rocket', icon: null, label: 'Rocket', emoji: '🚀' },
    { name: 'emoji-fire', icon: null, label: 'Fire', emoji: '🔥' },
    { name: 'emoji-sparkles', icon: null, label: 'Sparkles', emoji: '✨' },
    { name: 'emoji-star', icon: null, label: 'Star', emoji: '⭐' },
    { name: 'emoji-lightning', icon: null, label: 'Lightning', emoji: '⚡' },
    { name: 'emoji-brain', icon: null, label: 'Brain', emoji: '🧠' },
    { name: 'emoji-bulb', icon: null, label: 'Light Bulb', emoji: '💡' },
    { name: 'emoji-gear', icon: null, label: 'Gear', emoji: '⚙️' },
    { name: 'emoji-wrench', icon: null, label: 'Wrench', emoji: '🔧' },
    { name: 'emoji-hammer', icon: null, label: 'Hammer', emoji: '🔨' },
    { name: 'emoji-link', icon: null, label: 'Link', emoji: '🔗' },
    { name: 'emoji-package', icon: null, label: 'Package', emoji: '📦' },
    { name: 'emoji-folder', icon: null, label: 'Folder', emoji: '📁' },
    { name: 'emoji-file', icon: null, label: 'File', emoji: '📄' },
    { name: 'emoji-code', icon: null, label: 'Code', emoji: '💻' },
    { name: 'emoji-terminal', icon: null, label: 'Terminal', emoji: '🖥️' },
    { name: 'emoji-bug', icon: null, label: 'Bug', emoji: '🐛' },
    { name: 'emoji-check', icon: null, label: 'Check', emoji: '✅' },
    { name: 'emoji-cross', icon: null, label: 'Cross', emoji: '❌' },
    { name: 'emoji-warning', icon: null, label: 'Warning', emoji: '⚠️' },
    { name: 'emoji-stop', icon: null, label: 'Stop', emoji: '🛑' },
    { name: 'emoji-play', icon: null, label: 'Play', emoji: '▶️' },
    { name: 'emoji-target', icon: null, label: 'Target', emoji: '🎯' },
    { name: 'emoji-trophy', icon: null, label: 'Trophy', emoji: '🏆' },
    { name: 'emoji-medal', icon: null, label: 'Medal', emoji: '🥇' },
    { name: 'emoji-gem', icon: null, label: 'Gem', emoji: '💎' },
    { name: 'emoji-crystal', icon: null, label: 'Crystal Ball', emoji: '🔮' },
    { name: 'emoji-paint', icon: null, label: 'Paint', emoji: '🎨' },
    { name: 'emoji-music', icon: null, label: 'Music', emoji: '🎵' },
    { name: 'emoji-coffee', icon: null, label: 'Coffee', emoji: '☕' },
    { name: 'emoji-pizza', icon: null, label: 'Pizza', emoji: '🍕' },
    { name: 'emoji-heart', icon: null, label: 'Heart', emoji: '❤️' },
    { name: 'emoji-thumbsup', icon: null, label: 'Thumbs Up', emoji: '👍' },
    { name: 'emoji-clap', icon: null, label: 'Clap', emoji: '👏' },
    { name: 'emoji-wave', icon: null, label: 'Wave', emoji: '👋' },
    { name: 'emoji-eyes', icon: null, label: 'Eyes', emoji: '👀' },
    { name: 'emoji-100', icon: null, label: '100', emoji: '💯' },
    { name: 'emoji-boom', icon: null, label: 'Boom', emoji: '💥' },
    { name: 'emoji-zap', icon: null, label: 'Zap', emoji: '💨' },
  ],
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

// Emoji map for rendering emoji icons
export const emojiMap = {
  'emoji-robot': '🤖',
  'emoji-rocket': '🚀',
  'emoji-fire': '🔥',
  'emoji-sparkles': '✨',
  'emoji-star': '⭐',
  'emoji-lightning': '⚡',
  'emoji-brain': '🧠',
  'emoji-bulb': '💡',
  'emoji-gear': '⚙️',
  'emoji-wrench': '🔧',
  'emoji-hammer': '🔨',
  'emoji-link': '🔗',
  'emoji-package': '📦',
  'emoji-folder': '📁',
  'emoji-file': '📄',
  'emoji-code': '💻',
  'emoji-terminal': '🖥️',
  'emoji-bug': '🐛',
  'emoji-check': '✅',
  'emoji-cross': '❌',
  'emoji-warning': '⚠️',
  'emoji-stop': '🛑',
  'emoji-play': '▶️',
  'emoji-target': '🎯',
  'emoji-trophy': '🏆',
  'emoji-medal': '🥇',
  'emoji-gem': '💎',
  'emoji-crystal': '🔮',
  'emoji-paint': '🎨',
  'emoji-music': '🎵',
  'emoji-coffee': '☕',
  'emoji-pizza': '🍕',
  'emoji-heart': '❤️',
  'emoji-thumbsup': '👍',
  'emoji-clap': '👏',
  'emoji-wave': '👋',
  'emoji-eyes': '👀',
  'emoji-100': '💯',
  'emoji-boom': '💥',
  'emoji-zap': '💨',
};

const IconPicker = ({ selectedIcon, onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = useState('Emoji');
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
        {filteredIcons.map(({ name, icon: Icon, label, emoji }) => (
          <button
            key={name}
            className={`icon-option ${selectedIcon === name ? 'selected' : ''}`}
            onClick={() => onSelect(name)}
            title={label}
          >
            {emoji ? (
              <span style={{ fontSize: '20px' }}>{emoji}</span>
            ) : (
              <Icon size={20} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default IconPicker;
