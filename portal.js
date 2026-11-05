tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        kdu: {
                            navy: '#0A2540',
                            navyLight: '#123456',
                            blue: '#0066CC',
                            brightBlue: '#0052CC',
                            red: '#E63946',
                            redHover: '#D62839',
                            bg: '#F4F6F9',
                            cardBg: '#FFFFFF',
                            text: '#0F172A',
                            muted: '#64748B'
                        }
                    },
                    fontFamily: {
                        sans: ['Inter', 'sans-serif']
                    }
                }
            }
        }
         /*JAVASCRIPT APPLICATION DATABASE & CONTROLLER */
        // Pre-seeded database state
        const DEFAULT_STATE = {
            currentUser: null, // 'student' or 'admin'
            savedEvents: ['ev-1'], // Array of event IDs
            registrations: [
                // { id: 'reg-1', eventId: 'ev-1', passCode: 'KDU-PASS-8849', studentName: 'Muhammad Umar Sheraz', status: 'Registered' }
            ],
            events: [
                {
                    id: 'ev-1',
                    title: 'Annual AI & Robotics Hackathon',
                    category: 'Tech',
                    date: 'Nov 12, 2026 • 09:00 AM',
                    venue: 'Student Union Innovation Hub',
                    description: '24-hour university coding challenge with industry mentors, food, and cash prizes.',
                    capacity: 150,
                    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80'
                },
                {
                    id: 'ev-2',
                    title: 'Campus Career & Internship Fair 2026',
                    category: 'Career',
                    date: 'Nov 15, 2026 • 10:00 AM',
                    venue: 'Main University Gymnasium',
                    description: 'Connect with top engineering, business, and technology employers hiring graduates.',
                    capacity: 500,
                    image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80'
                },
                {
                    id: 'ev-3',
                    title: 'Autumn Campus Jazz Night',
                    category: 'Cultural',
                    date: 'Nov 18, 2026 • 07:00 PM',
                    venue: 'Grand University Auditorium',
                    description: 'Live musical performances by the KDU Music Society band and guest artists.',
                    capacity: 200,
                    image: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=800&q=80'
                }
            ],
            notifications: [
                {
                    id: 'notif-1',
                    title: 'Welcome to the new KDU Events portal',
                    body: 'Explore upcoming campus activities, save your favourites, register in one click, and keep your digital passes ready for check-in.',
                    time: 'Nov 1, 2026'
                }
            ]
        };

        // Load or initialize state from localStorage
        let appState = JSON.parse(localStorage.getItem('KDU_EVENTS_STATE')) || DEFAULT_STATE;

        function saveState() {
            localStorage.setItem('KDU_EVENTS_STATE', JSON.stringify(appState));
        }

        // Active state variables
        let selectedAuthRole = 'student';
        let activeView = 'overview';
        let myEventsTab = 'upcoming';

        // Initialize on Load
        window.onload = function() {
            updateHeroStats();
            renderAll();
        };

        function updateHeroStats() {
            document.getElementById('hero-stat-events').innerText = `${appState.events.length}+`;
        }

        // --- AUTH & LOGIN CONTROLLER ---
        function setAuthRole(role) {
            selectedAuthRole = role;
            const tabStudent = document.getElementById('tab-student');
            const tabAdmin = document.getElementById('tab-admin');
            const emailInput = document.getElementById('auth-email');
            const submitBtn = document.getElementById('auth-submit-btn');

            if (role === 'student') {
                tabStudent.classList.add('active');
                tabAdmin.classList.remove('active');
                emailInput.value = 'student@kdu.ac.lk';
                submitBtn.innerHTML = `<span>Continue to student portal</span><i class="fa-solid fa-arrow-right text-xs"></i>`;
            } else {
                tabAdmin.classList.add('active');
                tabStudent.classList.remove('active');
                emailInput.value = 'admin@kdu.ac.lk';
                submitBtn.innerHTML = `<span>Continue to admin portal</span><i class="fa-solid fa-arrow-right text-xs"></i>`;
            }
        }

        function fillDemo(role) {
            setAuthRole(role);
        }

        function handleLogin(e) {
            e.preventDefault();
            appState.currentUser = selectedAuthRole;
            saveState();

            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('portal-screen').classList.remove('hidden');

            // Setup Role UI Sidebar & Default Page
            setupSidebarAndUser();
            if (selectedAuthRole === 'student') {
                switchView('overview');
            } else {
                switchView('admin-overview');
            }

            showToast(`Logged in successfully as ${selectedAuthRole.toUpperCase()}`);
        }

        function handleSignOut() {
            appState.currentUser = null;
            saveState();
            document.getElementById('portal-screen').classList.add('hidden');
            document.getElementById('auth-screen').classList.remove('hidden');
            showToast('Signed out of KDU Events');
        }

        // --- NAVIGATION & SIDEBAR UI ---
        function setupSidebarAndUser() {
            const isStudent = appState.currentUser === 'student';
            const badgeText = document.getElementById('role-badge-text');
            const userName = document.getElementById('user-display-name');
            const userRole = document.getElementById('user-display-role');
            const userAvatar = document.getElementById('user-avatar');
            const nav = document.getElementById('sidebar-nav');

            if (isStudent) {
                badgeText.innerText = 'Student Portal';
                userName.innerText = 'Muhammad Umar Sheraz';
                userRole.innerText = 'Student Account';
                userAvatar.innerText = 'MU';

                nav.innerHTML = `
                    <button onclick="switchView('overview')" id="nav-overview" class="nav-item active w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white transition-all">
                        <i class="fa-solid fa-border-all w-5"></i> Overview
                    </button>
                    <button onclick="switchView('discover')" id="nav-discover" class="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white transition-all">
                        <i class="fa-solid fa-magnifying-glass w-5"></i> Discover events
                    </button>
                    <button onclick="switchView('myevents')" id="nav-myevents" class="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white transition-all">
                        <i class="fa-regular fa-calendar w-5"></i> My events
                    </button>
                    <button onclick="switchView('passes')" id="nav-passes" class="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white transition-all">
                        <i class="fa-solid fa-qrcode w-5"></i> Event passes
                    </button>
                    <button onclick="switchView('saved')" id="nav-saved" class="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white transition-all">
                        <i class="fa-regular fa-heart w-5"></i> Saved
                    </button>
                    <button onclick="switchView('notifications')" id="nav-notifications" class="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white transition-all">
                        <i class="fa-regular fa-bell w-5"></i> Notifications
                    </button>
                `;
            } else {
                badgeText.innerText = 'Admin Authority Portal';
                userName.innerText = 'Campus Admin Office';
                userRole.innerText = 'System Administrator';
                userAvatar.innerText = 'AD';

                nav.innerHTML = `
                    <button onclick="switchView('admin-overview')" id="nav-admin-overview" class="nav-item active w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white transition-all">
                        <i class="fa-solid fa-chart-line w-5"></i> Control Center
                    </button>
                    <button onclick="switchView('admin-manage')" id="nav-admin-manage" class="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white transition-all">
                        <i class="fa-solid fa-calendar-plus w-5"></i> Manage Events
                    </button>
                    <button onclick="switchView('admin-scanner')" id="nav-admin-scanner" class="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white transition-all">
                        <i class="fa-solid fa-qrcode w-5"></i> Attendance Scanner
                    </button>
                    <button onclick="switchView('admin-broadcast')" id="nav-admin-broadcast" class="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs text-slate-300 hover:text-white transition-all">
                        <i class="fa-solid fa-bullhorn w-5"></i> Broadcast Update
                    </button>
                `;
            }
        }

        function switchView(viewId) {
            activeView = viewId;
            document.querySelectorAll('.view-panel').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

            const targetView = document.getElementById(`view-${viewId}`);
            if (targetView) targetView.classList.remove('hidden');

            const targetNav = document.getElementById(`nav-${viewId}`);
            if (targetNav) targetNav.classList.add('active');

            document.getElementById('header-page-title').innerText = viewId.replace('admin-', '').toUpperCase();

            renderAll();
        }

        // --- RENDER CONTROLLERS ---
        function renderAll() {
            renderStudentStats();
            renderDiscoverEvents();
            renderMyEvents();
            renderDigitalPasses();
            renderSavedEvents();
            renderNotifications();
            renderAdminDashboard();
        }

        // 1. Student Overview Stats
        function renderStudentStats() {
            const userRegs = appState.registrations.filter(r => r.status === 'Registered');
            const userAttended = appState.registrations.filter(r => r.status === 'Attended');

            document.getElementById('stat-registered-count').innerText = userRegs.length;
            document.getElementById('stat-attended-count').innerText = userAttended.length;
            document.getElementById('stat-saved-count').innerText = appState.savedEvents.length;

            document.getElementById('overview-welcome-sub').innerText = 
                `You have ${userRegs.length} upcoming events and ${appState.notifications.length} campus updates.`;

            // Render upcoming card on overview
            const upcomingContainer = document.getElementById('overview-upcoming-container');
            if (userRegs.length > 0) {
                const nextReg = userRegs[0];
                const event = appState.events.find(e => e.id === nextReg.eventId);
                if (event) {
                    upcomingContainer.className = "bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center gap-6 text-left";
                    upcomingContainer.innerHTML = `
                        <img src="${event.image}" class="w-full md:w-32 h-24 object-cover rounded-xl" alt="event">
                        <div class="flex-1">
                            <span class="text-[10px] font-bold text-kdu-blue bg-blue-50 px-2 py-0.5 rounded">${event.category}</span>
                            <h4 class="text-base font-bold text-slate-900 mt-1">${event.title}</h4>
                            <p class="text-xs text-slate-500 mt-0.5"><i class="fa-regular fa-clock"></i> ${event.date} • ${event.venue}</p>
                        </div>
                        <button onclick="openQrModal('${nextReg.passCode}', '${event.title}', '${event.date}')" class="px-4 py-2 bg-kdu-navy text-white text-xs font-semibold rounded-xl">
                            View Pass
                        </button>
                    `;
                }
            }
        }

        // 2. Discover Events Grid & Filter
        function renderDiscoverEvents() {
            const grid = document.getElementById('discover-events-grid');
            if (!grid) return;

            const searchVal = document.getElementById('event-search-input')?.value.toLowerCase() || '';
            const catVal = document.getElementById('event-category-filter')?.value || 'ALL';

            const filtered = appState.events.filter(e => {
                const matchesSearch = e.title.toLowerCase().includes(searchVal) || e.venue.toLowerCase().includes(searchVal);
                const matchesCat = catVal === 'ALL' || e.category === catVal;
                return matchesSearch && matchesCat;
            });

            grid.innerHTML = filtered.map(e => {
                const isRegistered = appState.registrations.some(r => r.eventId === e.id && r.status === 'Registered');
                const isSaved = appState.savedEvents.includes(e.id);
                const rsvpCount = appState.registrations.filter(r => r.eventId === e.id).length;
                const seatsLeft = e.capacity - rsvpCount;

                return `
                    <div class="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm flex flex-col justify-between">
                        <div>
                            <div class="relative h-44">
                                <img src="${e.image}" class="w-full h-full object-cover" alt="event image">
                                <button onclick="toggleSaveEvent('${e.id}')" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-xs shadow-md transition-all">
                                    <i class="${isSaved ? 'fa-solid text-kdu-red' : 'fa-regular text-slate-600'} fa-heart"></i>
                                </button>
                                <span class="absolute bottom-3 left-3 px-2.5 py-1 bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold rounded-lg uppercase tracking-wider">
                                    ${e.category}
                                </span>
                            </div>
                            <div class="p-5">
                                <h3 class="font-bold text-slate-900 text-base mb-2">${e.title}</h3>
                                <div class="space-y-1 text-xs text-slate-500 mb-3">
                                    <div><i class="fa-regular fa-calendar text-kdu-blue w-4"></i> ${e.date}</div>
                                    <div><i class="fa-solid fa-location-dot text-kdu-blue w-4"></i> ${e.venue}</div>
                                </div>
                                <p class="text-xs text-slate-600 line-clamp-2">${e.description}</p>
                            </div>
                        </div>

                        <div class="p-5 pt-0 flex items-center justify-between border-t border-slate-100 mt-4 pt-4">
                            <span class="text-[11px] font-semibold text-emerald-600">
                                ${seatsLeft > 0 ? `${seatsLeft} seats left` : 'Fully Booked'}
                            </span>
                            ${isRegistered ? `
                                <button class="px-4 py-2 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl cursor-default">
                                    ✓ Registered
                                </button>
                            ` : `
                                <button onclick="registerForEvent('${e.id}')" class="px-4 py-2 bg-kdu-navy hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-all shadow-sm">
                                    Register
                                </button>
                            `}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Action: Register
        function registerForEvent(eventId) {
            const event = appState.events.find(e => e.id === eventId);
            if (!event) return;

            const passCode = `KDU-PASS-${Math.floor(1000 + Math.random() * 9000)}`;
            appState.registrations.push({
                id: `reg-${Date.now()}`,
                eventId: event.id,
                passCode: passCode,
                studentName: 'Muhammad Umar Sheraz',
                status: 'Registered'
            });

            saveState();
            renderAll();
            showToast(`Registered for ${event.title}! Pass ID: ${passCode}`);
        }

        // Action: Save / Bookmark
        function toggleSaveEvent(eventId) {
            const idx = appState.savedEvents.indexOf(eventId);
            if (idx > -1) {
                appState.savedEvents.splice(idx, 1);
                showToast('Removed from saved shortlist');
            } else {
                appState.savedEvents.push(eventId);
                showToast('Saved to your shortlist');
            }
            saveState();
            renderAll();
        }

        // 3. My Events List (Upcoming vs History)
        function setMyEventsTab(tab) {
            myEventsTab = tab;
            document.getElementById('myevents-tab-upcoming').className = tab === 'upcoming' 
                ? 'pb-3 text-xs font-bold border-b-2 border-kdu-navy text-kdu-navy' 
                : 'pb-3 text-xs font-semibold text-slate-500 hover:text-slate-800';
            document.getElementById('myevents-tab-history').className = tab === 'history' 
                ? 'pb-3 text-xs font-bold border-b-2 border-kdu-navy text-kdu-navy' 
                : 'pb-3 text-xs font-semibold text-slate-500 hover:text-slate-800';
            renderMyEvents();
        }

        function renderMyEvents() {
            const container = document.getElementById('myevents-list-container');
            if (!container) return;

            const upcoming = appState.registrations.filter(r => r.status === 'Registered');
            const history = appState.registrations.filter(r => r.status === 'Attended');

            document.getElementById('myevents-upcoming-count').innerText = upcoming.length;
            document.getElementById('myevents-history-count').innerText = history.length;

            const targetList = myEventsTab === 'upcoming' ? upcoming : history;

            if (targetList.length === 0) {
                container.innerHTML = `
                    <div class="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
                        <i class="fa-regular fa-folder-open text-3xl text-slate-300 mb-2"></i>
                        <h4 class="text-xs font-bold text-slate-600">Nothing listed here yet</h4>
                    </div>
                `;
                return;
            }

            container.innerHTML = targetList.map(r => {
                const event = appState.events.find(e => e.id === r.eventId);
                if (!event) return '';
                return `
                    <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                        <div class="flex items-center gap-4">
                            <img src="${event.image}" class="w-16 h-16 object-cover rounded-xl" alt="thumb">
                            <div>
                                <span class="text-[10px] font-bold text-kdu-blue uppercase">${event.category}</span>
                                <h4 class="font-bold text-slate-900 text-sm">${event.title}</h4>
                                <p class="text-xs text-slate-500">${event.date} • ${event.venue}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-xs font-mono bg-slate-100 px-3 py-1 rounded-lg text-slate-700">${r.passCode}</span>
                            <button onclick="openQrModal('${r.passCode}', '${event.title}', '${event.date}')" class="px-4 py-2 bg-kdu-navy text-white text-xs font-semibold rounded-xl">
                                Pass Code
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 4. Digital Passes Screen
        function renderDigitalPasses() {
            const grid = document.getElementById('digital-passes-grid');
            if (!grid) return;

            const registered = appState.registrations.filter(r => r.status === 'Registered');

            if (registered.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
                        <i class="fa-solid fa-qrcode text-4xl text-slate-300 mb-3"></i>
                        <h4 class="text-sm font-bold text-slate-800 mb-1">No active passes</h4>
                        <p class="text-xs text-slate-500 mb-4">Your digital pass is generated automatically when you register.</p>
                        <button onclick="switchView('discover')" class="px-4 py-2 bg-kdu-navy text-white text-xs font-semibold rounded-xl">
                            Browse events
                        </button>
                    </div>
                `;
                return;
            }

            grid.innerHTML = registered.map(r => {
                const event = appState.events.find(e => e.id === r.eventId);
                return `
                    <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm text-center relative overflow-hidden">
                        <div class="text-[10px] font-bold text-kdu-blue uppercase tracking-widest mb-1">Entry Ticket</div>
                        <h3 class="font-bold text-slate-900 text-sm mb-1">${event.title}</h3>
                        <p class="text-[11px] text-slate-500 mb-4">${event.date}</p>
                        <div class="w-24 h-24 bg-slate-100 rounded-xl mx-auto flex items-center justify-center border border-slate-200 mb-4 cursor-pointer" 
                             onclick="openQrModal('${r.passCode}', '${event.title}', '${event.date}')">
                            <i class="fa-solid fa-qrcode text-4xl text-slate-800"></i>
                        </div>
                        <div class="text-xs font-mono font-bold text-slate-800 bg-slate-50 py-1.5 px-3 rounded-lg border border-slate-200 inline-block">
                            ${r.passCode}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 5. Saved Events View
        function renderSavedEvents() {
            const container = document.getElementById('saved-events-container');
            if (!container) return;

            const savedList = appState.events.filter(e => appState.savedEvents.includes(e.id));

            if (savedList.length === 0) {
                container.innerHTML = `
                    <div class="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
                        <i class="fa-regular fa-heart text-4xl text-slate-300 mb-3"></i>
                        <h4 class="text-sm font-bold text-slate-800 mb-1">No saved events</h4>
                        <p class="text-xs text-slate-500 mb-4">Use the heart button to build your personal shortlist.</p>
                        <button onclick="switchView('discover')" class="px-4 py-2 bg-kdu-navy text-white text-xs font-semibold rounded-xl">
                            Browse events
                        </button>
                    </div>
                `;
                return;
            }

            container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">` + savedList.map(e => `
                <div class="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm p-4">
                    <h3 class="font-bold text-slate-900 text-sm mb-1">${e.title}</h3>
                    <p class="text-xs text-slate-500 mb-3">${e.date}</p>
                    <button onclick="toggleSaveEvent('${e.id}')" class="text-xs text-kdu-red font-semibold">
                        <i class="fa-solid fa-trash mr-1"></i> Remove from saved
                    </button>
                </div>
            `).join('') + `</div>`;
        }

        // 6. Notifications Hub View
        function renderNotifications() {
            const list = document.getElementById('notifications-list');
            const badge = document.getElementById('notif-badge');
            if (!list) return;

            badge.innerText = appState.notifications.length;

            list.innerHTML = appState.notifications.map(n => `
                <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-start gap-4">
                    <div class="w-9 h-9 rounded-full bg-blue-50 text-kdu-blue flex items-center justify-center flex-shrink-0">
                        <i class="fa-regular fa-bell"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-slate-900 text-xs mb-0.5">${n.title}</h4>
                        <p class="text-xs text-slate-600 leading-relaxed mb-1">${n.body}</p>
                        <span class="text-[10px] text-slate-400">${n.time}</span>
                    </div>
                </div>
            `).join('');
        }

        // --- ADMIN CONTROLLER FUNCTIONS ---
        function renderAdminDashboard() {
            document.getElementById('admin-kpi-events').innerText = appState.events.length;
            document.getElementById('admin-kpi-rsvps').innerText = appState.registrations.length;
            document.getElementById('admin-kpi-checkins').innerText = appState.registrations.filter(r => r.status === 'Attended').length;

            // Render Recent Activity List
            const actList = document.getElementById('admin-recent-activity-list');
            if (actList) {
                if (appState.registrations.length === 0) {
                    actList.innerHTML = `<div class="p-6 text-center text-slate-400">No student registrations logged yet.</div>`;
                } else {
                    actList.innerHTML = appState.registrations.slice(-5).reverse().map(r => {
                        const event = appState.events.find(e => e.id === r.eventId);
                        return `
                            <div class="p-4 flex items-center justify-between hover:bg-slate-50">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-[10px]">
                                        ${r.studentName.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div class="font-bold text-slate-900">${r.studentName}</div>
                                        <div class="text-[10px] text-slate-500">${event ? event.title : 'Event'} • Pass: ${r.passCode}</div>
                                    </div>
                                </div>
                                <span class="px-2.5 py-1 text-[10px] font-bold rounded-full ${r.status === 'Attended' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}">
                                    ${r.status}
                                </span>
                            </div>
                        `;
                    }).join('');
                }
            }

            // Render Admin Events Table Body
            const tableBody = document.getElementById('admin-events-table-body');
            if (tableBody) {
                tableBody.innerHTML = appState.events.map(e => {
                    const count = appState.registrations.filter(r => r.eventId === e.id).length;
                    return `
                        <tr class="hover:bg-slate-50">
                            <td class="p-4 font-bold text-slate-900">${e.title}</td>
                            <td class="p-4"><span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-semibold">${e.category}</span></td>
                            <td class="p-4">${e.capacity}</td>
                            <td class="p-4 font-semibold text-kdu-blue">${count} / ${e.capacity}</td>
                            <td class="p-4">
                                <button onclick="deleteEvent('${e.id}')" class="text-kdu-red hover:underline text-xs font-semibold">Delete</button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Admin Action: Create Event
        function handleCreateEvent(e) {
            e.preventDefault();
            const newEv = {
                id: `ev-${Date.now()}`,
                title: document.getElementById('new-event-title').value,
                category: document.getElementById('new-event-category').value,
                date: document.getElementById('new-event-date').value,
                venue: document.getElementById('new-event-venue').value,
                capacity: parseInt(document.getElementById('new-event-capacity').value),
                image: document.getElementById('new-event-image').value,
                description: document.getElementById('new-event-desc').value
            };

            appState.events.push(newEv);
            saveState();
            updateHeroStats();
            renderAll();
            showToast(`Published new event: ${newEv.title}`);
            e.target.reset();
        }

        function deleteEvent(eventId) {
            appState.events = appState.events.filter(e => e.id !== eventId);
            saveState();
            updateHeroStats();
            renderAll();
            showToast('Event removed from platform');
        }

        // Admin Action: Attendance Scanner Check-in
        function handleManualCheckin(e) {
            e.preventDefault();
            const passInput = document.getElementById('scanner-input-code').value.trim();
            const resultBox = document.getElementById('scanner-result-box');

            const reg = appState.registrations.find(r => r.passCode.toLowerCase() === passInput.toLowerCase());

            if (reg) {
                reg.status = 'Attended';
                saveState();
                renderAll();

                const event = appState.events.find(ev => ev.id === reg.eventId);

                resultBox.className = "flex-1 flex flex-col items-center justify-center border-2 border-emerald-500 bg-emerald-50 rounded-xl p-6 text-center";
                resultBox.innerHTML = `
                    <div class="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xl mb-2">
                        <i class="fa-solid fa-check"></i>
                    </div>
                    <h4 class="text-sm font-bold text-emerald-900">VERIFIED ATTENDEE</h4>
                    <p class="text-xs text-emerald-700 mt-1"><strong>${reg.studentName}</strong></p>
                    <p class="text-[11px] text-slate-500 mt-0.5">${event ? event.title : ''}</p>
                    <span class="mt-2 text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-800">${reg.passCode}</span>
                `;
                showToast(`Check-in confirmed for ${reg.studentName}`);
            } else {
                resultBox.className = "flex-1 flex flex-col items-center justify-center border-2 border-kdu-red bg-red-50 rounded-xl p-6 text-center";
                resultBox.innerHTML = `
                    <div class="w-12 h-12 bg-kdu-red text-white rounded-full flex items-center justify-center text-xl mb-2">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                    <h4 class="text-sm font-bold text-red-900">INVALID PASS CODE</h4>
                    <p class="text-xs text-red-700 mt-1">No active registration found for code "${passInput}".</p>
                `;
            }
        }

        // Admin Action: Post Announcement
        function handlePostAnnouncement(e) {
            e.preventDefault();
            const title = document.getElementById('announcement-title').value;
            const body = document.getElementById('announcement-body').value;

            appState.notifications.unshift({
                id: `notif-${Date.now()}`,
                title: title,
                body: body,
                time: 'Just now'
            });

            saveState();
            renderAll();
            showToast('Announcement broadcasted to student portal!');
            e.target.reset();
        }

        // --- QR MODAL HELPER ---
        function openQrModal(passCode, title, date) {
            document.getElementById('modal-event-title').innerText = title;
            document.getElementById('modal-event-date').innerText = date;
            document.getElementById('modal-pass-id').innerText = passCode;

            const qrContainer = document.getElementById('qrcode-canvas');
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, {
                text: passCode,
                width: 140,
                height: 140
            });

            document.getElementById('qr-modal').classList.remove('hidden');
        }

        function closeQrModal() {
            document.getElementById('qr-modal').classList.add('hidden');
        }

        // --- TOAST NOTIFICATIONS HELPER ---
        function showToast(message) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 transition-all transform translate-y-2 pointer-events-auto border border-slate-700';
            toast.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i> <span>${message}</span>`;
            container.appendChild(toast);
            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }