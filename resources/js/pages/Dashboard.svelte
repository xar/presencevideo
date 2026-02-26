<script lang="ts">
    import AppHead from '@/components/AppHead.svelte';
    import AppLayout from '@/layouts/AppLayout.svelte';
    import { dashboard } from '@/routes';
    import type { BreadcrumbItem } from '@/types';
    import { Activity, CreditCard, DollarSign, Users } from 'lucide-svelte';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Dashboard',
            href: dashboard().url,
        },
    ];
</script>

<AppHead title="Dashboard" />

<AppLayout {breadcrumbs}>
    <div class="flex h-full flex-1 flex-col gap-8 overflow-x-auto rounded-xl p-8 max-w-[1600px] mx-auto w-full">
        <div class="flex items-center justify-between">
            <div class="space-y-1">
                <h1 class="text-4xl font-bold tracking-tight text-foreground/90 bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70">Overview</h1>
                <p class="text-muted-foreground text-lg">Here's what's happening today.</p>
            </div>
        </div>
        
        <div class="grid auto-rows-min gap-8 md:grid-cols-2 lg:grid-cols-4">
            <Card class="bg-card/50 backdrop-blur-xl border-border/50 shadow-black/[0.03] dark:shadow-black/20 overflow-hidden group">
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4 relative z-10">
                    <CardTitle class="text-sm font-semibold text-muted-foreground group-hover:text-primary transition-colors">Total Revenue</CardTitle>
                    <div class="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300">
                        <DollarSign class="h-5 w-5 text-primary transition-colors group-hover:text-primary-foreground" />
                    </div>
                </CardHeader>
                <CardContent class="relative z-10 pt-0">
                    <div class="text-3xl font-black tracking-tight">$45,231.89</div>
                    <div class="flex items-center gap-1.5 mt-2">
                        <div class="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full text-xs font-bold">+20.1%</div>
                        <p class="text-xs text-muted-foreground font-medium">from last month</p>
                    </div>
                </CardContent>
                <div class="absolute -right-12 -bottom-12 h-40 w-40 bg-gradient-to-br from-primary/10 to-accent/10 rounded-full blur-3xl group-hover:from-primary/20 group-hover:to-accent/20 transition-all duration-500"></div>
            </Card>
            
            <Card class="bg-card/50 backdrop-blur-xl border-border/50 shadow-black/[0.03] dark:shadow-black/20 overflow-hidden group">
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4 relative z-10">
                    <CardTitle class="text-sm font-semibold text-muted-foreground group-hover:text-chart-2 transition-colors">Subscriptions</CardTitle>
                    <div class="h-10 w-10 rounded-xl bg-chart-2/10 flex items-center justify-center group-hover:bg-chart-2 group-hover:text-primary-foreground group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300">
                        <Users class="h-5 w-5 text-chart-2 transition-colors group-hover:text-primary-foreground" />
                    </div>
                </CardHeader>
                <CardContent class="relative z-10 pt-0">
                    <div class="text-3xl font-black tracking-tight">+2350</div>
                    <div class="flex items-center gap-1.5 mt-2">
                        <div class="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full text-xs font-bold">+180.1%</div>
                        <p class="text-xs text-muted-foreground font-medium">from last month</p>
                    </div>
                </CardContent>
                <div class="absolute -right-12 -bottom-12 h-40 w-40 bg-gradient-to-br from-chart-2/10 to-chart-3/10 rounded-full blur-3xl group-hover:from-chart-2/20 group-hover:to-chart-3/20 transition-all duration-500"></div>
            </Card>
            
            <Card class="bg-card/50 backdrop-blur-xl border-border/50 shadow-black/[0.03] dark:shadow-black/20 overflow-hidden group">
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4 relative z-10">
                    <CardTitle class="text-sm font-semibold text-muted-foreground group-hover:text-chart-3 transition-colors">Sales</CardTitle>
                    <div class="h-10 w-10 rounded-xl bg-chart-3/10 flex items-center justify-center group-hover:bg-chart-3 group-hover:text-primary-foreground group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300">
                        <CreditCard class="h-5 w-5 text-chart-3 transition-colors group-hover:text-primary-foreground" />
                    </div>
                </CardHeader>
                <CardContent class="relative z-10 pt-0">
                    <div class="text-3xl font-black tracking-tight">+12,234</div>
                    <div class="flex items-center gap-1.5 mt-2">
                        <div class="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full text-xs font-bold">+19%</div>
                        <p class="text-xs text-muted-foreground font-medium">from last month</p>
                    </div>
                </CardContent>
                <div class="absolute -right-12 -bottom-12 h-40 w-40 bg-gradient-to-br from-chart-3/10 to-chart-4/10 rounded-full blur-3xl group-hover:from-chart-3/20 group-hover:to-chart-4/20 transition-all duration-500"></div>
            </Card>
            
            <Card class="bg-card/50 backdrop-blur-xl border-border/50 shadow-black/[0.03] dark:shadow-black/20 overflow-hidden group">
                <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4 relative z-10">
                    <CardTitle class="text-sm font-semibold text-muted-foreground group-hover:text-chart-4 transition-colors">Active Now</CardTitle>
                    <div class="h-10 w-10 rounded-xl bg-chart-4/10 flex items-center justify-center group-hover:bg-chart-4 group-hover:text-primary-foreground group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300">
                        <Activity class="h-5 w-5 text-chart-4 transition-colors group-hover:text-primary-foreground" />
                    </div>
                </CardHeader>
                <CardContent class="relative z-10 pt-0">
                    <div class="text-3xl font-black tracking-tight">+573</div>
                    <div class="flex items-center gap-1.5 mt-2">
                        <div class="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full text-xs font-bold">+201</div>
                        <p class="text-xs text-muted-foreground font-medium">since last hour</p>
                    </div>
                </CardContent>
                <div class="absolute -right-12 -bottom-12 h-40 w-40 bg-gradient-to-br from-chart-4/10 to-primary/10 rounded-full blur-3xl group-hover:from-chart-4/20 group-hover:to-primary/20 transition-all duration-500"></div>
            </Card>
        </div>
        
        <div class="grid flex-1 gap-8 md:grid-cols-2 lg:grid-cols-7">
            <Card class="col-span-4 bg-card/50 backdrop-blur-xl border-border/50 shadow-black/[0.03] dark:shadow-black/20 flex flex-col group overflow-hidden relative">
                <div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
                <CardHeader class="pb-4 relative z-10">
                    <CardTitle class="text-2xl">Revenue Overview</CardTitle>
                    <CardDescription class="text-base mt-1">Monthly performance breakdown</CardDescription>
                </CardHeader>
                <CardContent class="pl-0 flex-1 relative z-10">
                    <div class="h-full min-h-[350px] w-full flex items-center justify-center text-sm font-medium text-muted-foreground/60 rounded-xl border-2 border-dashed border-border/50 bg-background/50 m-4 w-[calc(100%-2rem)]">
                        <div class="flex flex-col items-center gap-4 group-hover:scale-105 transition-transform duration-500">
                            <div class="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center shadow-inner">
                                <Activity class="h-8 w-8 text-primary/50" />
                            </div>
                            Interactive Chart Component
                        </div>
                    </div>
                </CardContent>
            </Card>
            
            <Card class="col-span-3 bg-card/50 backdrop-blur-xl border-border/50 shadow-black/[0.03] dark:shadow-black/20 group overflow-hidden relative">
                <div class="absolute -right-32 -top-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700 pointer-events-none"></div>
                <CardHeader class="pb-6 relative z-10">
                    <CardTitle class="text-2xl">Recent Sales</CardTitle>
                    <CardDescription class="text-base mt-1 text-primary font-medium">265 sales this month.</CardDescription>
                </CardHeader>
                <CardContent class="relative z-10">
                    <div class="space-y-6">
                        {#each Array(5) as _, i}
                            <div class="flex items-center group/item cursor-pointer rounded-2xl -mx-4 px-4 py-3 hover:bg-background/80 transition-all duration-300 hover:shadow-sm">
                                <div class="h-12 w-12 rounded-xl flex items-center justify-center text-sm font-bold border-2 border-background shadow-md shadow-black/5 transition-transform duration-300 group-hover/item:scale-110 group-hover/item:-rotate-6"
                                     style="background: linear-gradient(135deg, hsl({(i * 35 + 140) % 360} 80% 45%), hsl({(i * 35 + 170) % 360} 80% 40%)); color: white;">
                                    {['OM', 'JL', 'IN', 'WK', 'SD'][i]}
                                </div>
                                <div class="ml-4 space-y-1">
                                    <p class="text-base font-bold leading-none text-foreground/90 group-hover/item:text-primary transition-colors">
                                        {['Olivia Martin', 'Jackson Lee', 'Isabella Nguyen', 'William Kim', 'Sofia Davis'][i]}
                                    </p>
                                    <p class="text-sm font-medium text-muted-foreground group-hover/item:text-muted-foreground/80 transition-colors">
                                        {['olivia.martin@email.com', 'jackson.lee@email.com', 'isabella.nguyen@email.com', 'will@email.com', 'sofia.davis@email.com'][i]}
                                    </p>
                                </div>
                                <div class="ml-auto font-black text-lg text-foreground/90 group-hover/item:text-primary transition-colors">
                                    +${['1,999', '39', '299', '99', '39'][i]}<span class="text-sm text-muted-foreground font-medium">.00</span>
                                </div>
                            </div>
                        {/each}
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
</AppLayout>
