import LayoutGrid from 'lucide-svelte/icons/layout-grid';
import MessageSquarePlus from 'lucide-svelte/icons/message-square-plus';
import Video from 'lucide-svelte/icons/video';
import { edit as editAppearance } from '@/routes/appearance';
import agent from '@/routes/agent';
import editor from '@/routes/editor';
import { edit as editProfile } from '@/routes/profile';
import { show as showTwoFactor } from '@/routes/two-factor';
import { edit as editPassword } from '@/routes/user-password';
import type { NavItem } from '@/types';

export const appHome = editor.index();

export const mainNavItems: NavItem[] = [
    {
        title: 'Projects',
        href: appHome,
        icon: LayoutGrid,
    },
];

export const sidebarNavItems: NavItem[] = [
    {
        title: 'New chat',
        href: agent.chat.index(),
        icon: MessageSquarePlus,
    },
    {
        title: 'Projects',
        href: appHome,
        icon: Video,
    },
];

export const utilityNavItems: NavItem[] = [];

export const settingsNavItems: NavItem[] = [
    {
        title: 'Profile',
        href: editProfile(),
    },
    {
        title: 'Password',
        href: editPassword(),
    },
    {
        title: 'Two-Factor Auth',
        href: showTwoFactor(),
    },
    {
        title: 'Appearance',
        href: editAppearance(),
    },
];
