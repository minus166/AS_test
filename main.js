document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const inputs = document.querySelectorAll('input');

    // Simple interaction: Button loading state mock
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = loginForm.querySelector('.btn-login');
        const originalText = btn.innerText;

        btn.innerText = 'Signing in...';
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';

        // Simulate API call
        setTimeout(() => {
            handleManualLogin({ email: loginForm.querySelector('#email').value });
            btn.innerText = originalText;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }, 1500);
    });

    // Parallax background effect
    document.addEventListener('mousemove', (e) => {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;

        const blob = document.querySelector('.bg-blob');
        blob.style.transform = `translate(${x * 50}px, ${y * 50}px)`;
    });

    // Google Integration
    const googleBtn = document.getElementById('googleBtn');
    let tokenClient;

    if (googleBtn) {
        window.onload = () => {
            // Initialize Identity Services (for login)
            google.accounts.id.initialize({
                client_id: "298633043815-tekh0vgks79hnp46o7fnd7p9koh5vo83.apps.googleusercontent.com",
                callback: handleCredentialResponse
            });

            google.accounts.id.renderButton(
                googleBtn,
                { theme: "filled_blue", size: "large", shape: "pill", width: 250 }
            );

            // Initialize Token Client (for Gmail API access)
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: "298633043815-tekh0vgks79hnp46o7fnd7p9koh5vo83.apps.googleusercontent.com",
                scope: 'https://www.googleapis.com/auth/gmail.readonly',
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        fetchGmailMessages(tokenResponse.access_token);
                    }
                },
            });
        };
    }

    function handleCredentialResponse(response) {
        const responsePayload = decodeJwt(response.credential);

        const loginCard = document.querySelector('.login-card');
        const successCard = document.getElementById('successCard');

        loginCard.classList.add('fade-out');

        setTimeout(() => {
            loginCard.style.display = 'none';
            document.getElementById('userAvatar').src = responsePayload.picture;
            document.getElementById('welcomeTitle').innerText = `Welcome, ${responsePayload.given_name}!`;
            document.getElementById('userEmail').innerText = responsePayload.email;
            successCard.style.display = 'block';

            // Show Gmail container
            document.getElementById('gmailContainer').style.display = 'block';
            document.getElementById('successMsg').innerText = `You have successfully signed in with Google.`;

            // Set up manual fetch trigger to avoid popup blocking
            document.getElementById('loadEmailsBtn').onclick = () => {
                document.getElementById('gmailList').innerHTML = '<div class="loading-spinner">Fetching emails...</div>';
                tokenClient.requestAccessToken();
            };

            // Fetch Weather
            initWeather();
        }, 500);
    }

    function handleManualLogin(user) {
        const loginCard = document.querySelector('.login-card');
        const successCard = document.getElementById('successCard');

        loginCard.classList.add('fade-out');

        setTimeout(() => {
            loginCard.style.display = 'none';
            document.getElementById('userAvatar').src = `https://ui-avatars.com/api/?name=${user.email}&background=7c3aed&color=fff`;
            document.getElementById('welcomeTitle').innerText = `Welcome!`;
            document.getElementById('userEmail').innerText = user.email;
            document.getElementById('successMsg').innerText = `You have successfully signed in.`;
            successCard.style.display = 'block';

            // Fetch Weather
            initWeather();
        }, 500);
    }
});

async function fetchGmailMessages(accessToken) {
    const gmailList = document.getElementById('gmailList');

    try {
        // 1. Get List of messages
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();

        if (!data.messages || data.messages.length === 0) {
            gmailList.innerHTML = '<div class="loading-spinner">No messages found.</div>';
            return;
        }

        gmailList.innerHTML = ''; // Clear loading

        // 2. Fetch details for each message
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
        gmailList.innerHTML = '<div class="loading-spinner">Failed to load messages.</div>';
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

        // Parse Body
        const bodyData = getEmailBody(detail.payload);
        modalBody.innerHTML = bodyData;

    } catch (error) {
        console.error('Error showing email detail:', error);
        modalBody.innerHTML = '<div class="loading-spinner" style="color:red">Failed to load email content.</div>';
    }

    closeModal.onclick = () => {
        modal.style.display = 'none';
    };
}

function getEmailBody(payload) {
    let body = "";
    if (payload.parts) {
        // Try to find HTML first
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


// --- Weather Logic ---
const WEATHER_API_KEY = '0185d1a77fc1e0d1d18120e644a339d5';

async function initWeather() {
    const weatherWidget = document.getElementById('weatherWidget');
    const weatherLocation = document.getElementById('weatherLocation');

    weatherWidget.style.display = 'flex';

    if (!navigator.geolocation) {
        weatherLocation.innerText = "Geolocation is not supported by your browser";
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
            const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${WEATHER_API_KEY}&units=metric`);

            if (!response.ok) {
                const errorData = await response.json();
                if (response.status === 401) {
                    weatherLocation.innerText = "API Key not active or invalid";
                } else {
                    weatherLocation.innerText = `Error: ${errorData.message || 'Unknown error'}`;
                }
                return;
            }

            const data = await response.json();
            displayWeather(data);
        } catch (error) {
            console.error('Error fetching weather:', error);
            weatherLocation.innerText = "Connection error";
        }
    }, (error) => {
        console.error('Geolocation error:', error);
        weatherLocation.innerText = "Location access denied";
    });
}

function displayWeather(data) {
    if (!data || !data.main || !data.weather) return;

    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;
    const iconCode = data.weather[0].icon;
    const city = data.name;

    document.getElementById('weatherTemp').innerText = `${temp}°C`;
    document.getElementById('weatherDesc').innerText = desc;
    document.getElementById('weatherIcon').src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
    document.getElementById('weatherLocation').innerText = `📍 ${city}`;
}

function decodeJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
}
// Auto-push enabled
