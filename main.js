// --- Firebase Configuration ---
// TO USER: Replace placeholders with your actual Firebase project config from the Firebase Console.
const firebaseConfig = {
    apiKey: "AIzaSyB6JuVj6Ndzg-0RPfpR0vCWJ05tEktA-II",
    authDomain: "as-test-1b82d.firebaseapp.com",
    projectId: "as-test-1b82d",
    storageBucket: "as-test-1b82d.firebasestorage.app",
    messagingSenderId: "1010049513474",
    appId: "1:1010049513474:web:d26452fbc01077537d4f1b",
    measurementId: "G-HCK2K8WR1X"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let todos = [];
let todoUnsubscribe = null;
let transitionTimer = null; // UI 전환 타이머를 추적하여 레이스 컨디션을 방지합니다.
let globalForceLogout = false; // 전역적으로 로그아웃 강제 상태를 공유합니다.

document.addEventListener('DOMContentLoaded', async () => {
    // 0. 가드 변수 초기화
    const urlParams = new URLSearchParams(window.location.search);
    globalForceLogout = urlParams.get('logout') === 'true';
    const isLoggingOut = sessionStorage.getItem('isLoggingOut');

    console.log("APP_START: URL Guard =", globalForceLogout, "| Session Guard =", !!isLoggingOut);

    // 1. Firebase 지속성 설정 (세션 종료 시 자동 로그아웃 보장)
    try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
        console.log("FIREBASE: Persistence set to SESSION");
    } catch (e) {
        console.error("FIREBASE: Persistence error", e);
    }

    // 2. 로그아웃 가드 집행
    if (globalForceLogout || isLoggingOut) {
        console.warn("GUARD_ACTIVE: Wiping current session and forcing sign-out.");

        // 중요: 모든 걸 다 지우되 'isLoggingOut' 상태는 유지하여 관찰자가 뚫리지 않게 합니다.
        localStorage.clear();
        sessionStorage.removeItem('gmailAccessToken');
        auth.signOut().catch(() => { });

        // URL에서 logout 파라미터 제거
        if (window.location.search.includes('logout=true')) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        showLoginCard();

        // 중요: 모든 정리 작업 후에는 가드 해제
        globalForceLogout = false;
        sessionStorage.removeItem('isLoggingOut');
    }

    const loginForm = document.getElementById('loginForm');
    const googleBtn = document.getElementById('googleBtn');

    // 3. Auth State Observer (Firebase 전용)
    auth.onAuthStateChanged((user) => {
        console.log("AUTH_OBSERVER: Firebase signal ->", user ? user.email : "none");

        // 가드가 활성 상태라면 Firebase 신호를 무시합니다.
        if (globalForceLogout || sessionStorage.getItem('isLoggingOut')) {
            console.warn("AUTH_OBSERVER: Signal blocked by active guard.");
            return;
        }

        if (user) {
            currentUser = user;
            showSuccessCard(user);
        } else {
            // Firebase 세션이 없고, 현재 수동 로그인 중도 아니라면 로그인 창 노출
            if (!currentUser || currentUser.uid) {
                currentUser = null;
                showLoginCard();
            }
        }
    });

    // 4. Manual Login handling (Simulation)
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // 로그인 시작 시 모든 가드 해제
        globalForceLogout = false;
        sessionStorage.removeItem('isLoggingOut');
        const email = loginForm.querySelector('#email').value;
        const btn = loginForm.querySelector('.btn-login');

        btn.innerText = 'Signing in...';
        btn.style.opacity = '0.7';

        setTimeout(() => {
            // 로그인 완료 시 가드를 해제하여 정상 진입 허용
            sessionStorage.removeItem('isLoggingOut');
            currentUser = { email, displayName: email.split('@')[0], photoURL: null };
            showSuccessCard(currentUser);
            btn.innerText = 'Sign in';
            btn.style.opacity = '1';
        }, 500);
    });

    // 3. Google Login handling (Firebase)
    if (googleBtn) {
        googleBtn.innerHTML = `
            <button class="social-btn" style="width: 100%; gap: 10px;">
                <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.39-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
            </button>
        `;
        googleBtn.onclick = () => {
            // 로그인 시작 시 모든 가드 해제
            globalForceLogout = false;
            sessionStorage.removeItem('isLoggingOut');

            const provider = new firebase.auth.GoogleAuthProvider();
            // Add Gmail Read-only scope
            provider.addScope('https://www.googleapis.com/auth/gmail.readonly');

            auth.signInWithPopup(provider).then((result) => {
                // Store the credential to get the access token for Gmail API
                const credential = result.credential;
                const accessToken = credential.accessToken;

                // Save access token for current session
                sessionStorage.setItem('gmailAccessToken', accessToken);

                // Show Gmail container and load messages
                document.getElementById('gmailContainer').style.display = 'block';
                fetchGmailMessages(accessToken);
            }).catch(err => {
                console.error(err);
                alert("Google Sign-in failed: " + err.message);
            });
        };
    }

    // Parallax background effect
    document.addEventListener('mousemove', (e) => {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        const blob = document.querySelector('.bg-blob');
        if (blob) blob.style.transform = `translate(${x * 50}px, ${y * 50}px)`;
    });
});

function showLoginCard() {
    if (transitionTimer) clearTimeout(transitionTimer); // 진행 중인 다른 화면 전환을 취소합니다.

    const loginCard = document.querySelector('.login-card');
    const successCard = document.getElementById('successCard');
    loginCard.style.display = 'block';
    loginCard.classList.remove('fade-out');
    successCard.style.display = 'none';
    if (todoUnsubscribe) todoUnsubscribe();
    sessionStorage.removeItem('gmailAccessToken');
}

function showSuccessCard(user) {
    if (transitionTimer) clearTimeout(transitionTimer); // 진행 중인 다른 화면 전환을 취소합니다.

    console.group("showSuccessCard called");
    console.log("User:", user.email);
    console.groupEnd();

    const loginCard = document.querySelector('.login-card');
    const successCard = document.getElementById('successCard');

    loginCard.classList.add('fade-out');

    transitionTimer = setTimeout(() => {
        // 타이머 실행 시점에 실제 로그아웃 플래그가 있는지 다시 한번 확인
        if (globalForceLogout || sessionStorage.getItem('isLoggingOut')) {
            console.log("SuccessCard aborted: Logout in progress");
            return;
        }

        loginCard.style.display = 'none';
        document.getElementById('userAvatar').src = user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=7c3aed&color=fff`;
        document.getElementById('welcomeTitle').innerText = user.displayName ? `Welcome, ${user.displayName.split(' ')[0]}!` : 'Welcome!';
        document.getElementById('userEmail').innerText = user.email;
        successCard.style.display = 'block';

        const gmailToken = sessionStorage.getItem('gmailAccessToken');
        if (gmailToken) {
            document.getElementById('gmailContainer').style.display = 'block';
            fetchGmailMessages(gmailToken);

            // Wire up the refresh button
            const loadEmailsBtn = document.getElementById('loadEmailsBtn');
            if (loadEmailsBtn) {
                loadEmailsBtn.onclick = () => fetchGmailMessages(gmailToken);
            }
        }

        initWeather();
        initTodo(user.uid || user.email);
        transitionTimer = null;
    }, 500);
}

// --- Gmail Logic (Restored) ---
async function fetchGmailMessages(accessToken) {
    const gmailList = document.getElementById('gmailList');
    gmailList.innerHTML = '<div class="loading-spinner">Loading messages...</div>';

    try {
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();

        if (!response.ok) {
            console.error('Gmail API Error:', data);

            let errorMessage = `Error: ${data.error?.message || 'Unknown error'}`;
            if (data.error?.message?.includes('API has not been used') || data.error?.message?.includes('is disabled')) {
                errorMessage = `
                    <p>The Gmail API is not enabled for this project.</p>
                    <a href="https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=${firebaseConfig.projectId}" target="_blank" class="btn-small" style="display:inline-block; margin-top:8px; text-decoration:none;">Enable Gmail API</a>
                    <p style="font-size:0.8em; margin-top:8px;">(Wait a few minutes after enabling)</p>
                `;
            }

            gmailList.innerHTML = `<div class="loading-spinner" style="color: var(--error); text-align: left;">${errorMessage}</div>`;
            return;
        }

        if (!data.messages || data.messages.length === 0) {
            gmailList.innerHTML = '<div class="loading-spinner">No messages found in your inbox.</div>';
            return;
        }

        gmailList.innerHTML = '';
        for (const msg of data.messages) {
            const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const detail = await detailResponse.json();

            const subject = detail.payload.headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
            const from = detail.payload.headers.find(h => h.name === 'From')?.value || '(Unknown)';

            const item = document.createElement('div');
            item.className = 'gmail-item';
            item.innerHTML = `
                <div class="gmail-subject">${subject}</div>
                <div class="gmail-from">${from}</div>
            `;
            item.onclick = () => showEmailDetail(msg.id, accessToken);
            gmailList.appendChild(item);
        }
    } catch (error) {
        console.error('Error fetching Gmail:', error);
        gmailList.innerHTML = '<div class="loading-spinner">Failed to load Gmail. Check scopes.</div>';
    }
}

async function showEmailDetail(messageId, accessToken) {
    const modal = document.getElementById('emailModal');
    const modalSubject = document.getElementById('modalSubject');
    const modalFrom = document.getElementById('modalFrom');
    const modalBody = document.getElementById('modalBody');
    const closeModal = document.getElementById('closeModal');

    modalBody.innerHTML = '<div class="loading-spinner">Loading content...</div>';
    modal.style.display = 'flex';

    try {
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const detail = await response.json();

        const subject = detail.payload.headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
        const from = detail.payload.headers.find(h => h.name === 'From')?.value || '(Unknown)';

        modalSubject.innerText = subject;
        modalFrom.innerText = from;

        // Parse Body safely using an iframe
        const bodyData = getEmailBody(detail.payload);
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '400px';
        iframe.style.border = 'none';
        modalBody.innerHTML = '';
        modalBody.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(bodyData);
        doc.close();

    } catch (error) {
        console.error('Error showing email detail:', error);
    }

    closeModal.onclick = () => {
        modal.style.display = 'none';
    };
}

function getEmailBody(payload) {
    let body = "";
    if (payload.parts) {
        let htmlPart = findPart(payload.parts, 'text/html');
        let textPart = findPart(payload.parts, 'text/plain');
        const selectedPart = htmlPart || textPart;
        if (selectedPart && selectedPart.body && selectedPart.body.data) {
            body = decodeBase64Safe(selectedPart.body.data);
        }
    } else if (payload.body && payload.body.data) {
        body = decodeBase64Safe(payload.body.data);
    }
    return body || "(No content)";
}

function findPart(parts, mimeType) {
    for (const part of parts) {
        if (part.mimeType === mimeType) return part;
        if (part.parts) {
            const found = findPart(part.parts, mimeType);
            if (found) return found;
        }
    }
    return null;
}

function decodeBase64Safe(data) {
    return decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
}

// --- Todo List Logic (Firebase Firestore) ---
async function initTodo(userId) {
    const todoInput = document.getElementById('todoInput');
    const addTodoBtn = document.getElementById('addTodoBtn');

    // Subscribe to real-time updates from Firestore
    if (todoUnsubscribe) todoUnsubscribe();

    // We use a safe collection path based on userId
    const todoCollection = db.collection('users').doc(userId).collection('todos');

    todoUnsubscribe = todoCollection.orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        todos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTodos(userId);
    });

    addTodoBtn.onclick = () => addTodo(userId);
    todoInput.onkeypress = (e) => {
        if (e.key === 'Enter') addTodo(userId);
    };
}

async function addTodo(userId) {
    const todoInput = document.getElementById('todoInput');
    const text = todoInput.value.trim();

    if (text) {
        try {
            await db.collection('users').doc(userId).collection('todos').add({
                text: text,
                completed: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            todoInput.value = '';
        } catch (error) {
            console.error("Error adding todo:", error);
            alert("Need to configure Firestore rules first!");
        }
    }
}

async function toggleTodo(userId, todoId, currentStatus) {
    try {
        await db.collection('users').doc(userId).collection('todos').doc(todoId).update({
            completed: !currentStatus
        });
    } catch (error) {
        console.error("Error toggling todo:", error);
    }
}

async function deleteTodo(userId, todoId) {
    try {
        await db.collection('users').doc(userId).collection('todos').doc(todoId).delete();
    } catch (error) {
        console.error("Error deleting todo:", error);
    }
}

function renderTodos(userId) {
    const todoList = document.getElementById('todoList');
    todoList.innerHTML = '';

    if (todos.length === 0) {
        todoList.innerHTML = '<div class="loading-spinner">No tasks yet. Add one above!</div>';
        return;
    }

    todos.forEach(todo => {
        const item = document.createElement('div');
        item.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        item.innerHTML = `
            <div class="todo-content">
                <div class="todo-checkbox ${todo.completed ? 'checked' : ''}" onclick="toggleTodo('${userId}', '${todo.id}', ${todo.completed})"></div>
                <span class="todo-text">${todo.text}</span>
            </div>
            <button class="btn-delete" onclick="deleteTodo('${userId}', '${todo.id}')">&times;</button>
        `;
        todoList.appendChild(item);
    });
}

// --- Weather Logic ---
const WEATHER_API_KEY = '0185d1a77fc1e0d1d18120e644a339d5';

async function initWeather() {
    const weatherWidget = document.getElementById('weatherWidget');
    const weatherLocation = document.getElementById('weatherLocation');
    weatherWidget.style.display = 'flex';

    if (!navigator.geolocation) {
        weatherLocation.innerText = "Geolocation not supported";
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
            const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${WEATHER_API_KEY}&units=metric`);
            const data = await response.json();
            displayWeather(data);
        } catch (error) {
            console.error('Error fetching weather:', error);
        }
    });
}

function displayWeather(data) {
    if (!data || !data.main) return;
    document.getElementById('weatherTemp').innerText = `${Math.round(data.main.temp)}°C`;
    document.getElementById('weatherDesc').innerText = data.weather[0].description;
    document.getElementById('weatherIcon').src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
    document.getElementById('weatherLocation').innerText = `📍 ${data.name}`;
}

// Ensure signOut is globally accessible for the HTML onclick handler
window.signOut = async function () {
    console.log("SIGNOUT_FLOW: Initiating via URL guard...");
    try {
        sessionStorage.setItem('isLoggingOut', 'true');
        await auth.signOut();
        sessionStorage.removeItem('gmailAccessToken');
        localStorage.clear();

        // ?logout=true 를 붙여서 새로고침합니다.
        window.location.replace(window.location.origin + window.location.pathname + '?logout=true');
    } catch (error) {
        console.error("SIGNOUT_FLOW: Error ->", error);
        window.location.href = '/?logout=true';
    }
};
