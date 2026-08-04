import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBcayr5NOjbrAuLn7bkUovRWVyG4O9wMPk",
    authDomain: "flooded-95eeb.firebaseapp.com",
    projectId: "flooded-95eeb",
    storageBucket: "flooded-95eeb.firebasestorage.app",
    messagingSenderId: "142547476223",
    appId: "1:142547476223:web:70de7014c664e26d0636ca"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const chartInstances = {};

window.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('loggedIn') !== 'true') { 
        window.location.href = 'log.html'; 
    }
    
    const emailElem = document.getElementById("emails");
    if (emailElem) {
        emailElem.innerHTML = sessionStorage.getItem("userEmail") || "Admin";
    }

    // Build the 3 circle doughnut layouts
    initCircleGraphs();

    // Bind real-time data listeners for nodes
    bindStationNode('data', 'pasuquin');
    bindStationNode('data2', 'laoag');
    bindStationNode('data3', 'bacarra');

    // Logout event listeners
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
        logoutLink.addEventListener('click', logoutUser);
    }

    const dropdownLogout = document.getElementById('dropdownLogout');
    if (dropdownLogout) {
        dropdownLogout.addEventListener('click', logoutUser);
    }
});

function logoutUser(e) {
    if (e) e.preventDefault();
    sessionStorage.clear();
    window.location.href = 'log.html';
}

function initCircleGraphs() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: { legend: { display: false } }
    };

    // Users Circle Graph
    chartInstances['usersCircleChart'] = new Chart(document.getElementById('usersCircleChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Users Registered', 'Target capacity Space'],
            datasets: [{
                data: [4, 20], 
                backgroundColor: ['#1c96c5', '#e9ecef'],
                borderWidth: 0
            }]
        },
        options: commonOptions
    });

    // Stations Circle Graph
    chartInstances['stationsCircleChart'] = new Chart(document.getElementById('stationsCircleChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Active Nodes', 'Inactive Space'],
            datasets: [{
                data: [3, 10], 
                backgroundColor: ['#198754', '#e9ecef'],
                borderWidth: 0
            }]
        },
        options: commonOptions
    });

    // Municipalities Circle Graph
    chartInstances['municipalitiesCircleChart'] = new Chart(document.getElementById('municipalitiesCircleChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Municipalities Covered', 'Remaining Provincial Space'],
            datasets: [{
                data: [23, 25], 
                backgroundColor: ['#ffc107', '#e9ecef'],
                borderWidth: 0
            }]
        },
        options: commonOptions
    });
}

function getDepthInfo(level) {
    const l = parseFloat(level);
    if (l >= 4.0) return { label: 'High Risk', class: 'lvl-high', depthCalc: (l * 0.8).toFixed(2) + ' m' };
    if (l >= 2.5) return { label: 'Warning', class: 'lvl-med', depthCalc: (l * 0.4).toFixed(2) + ' m' };
    return { label: 'Safe', class: 'lvl-low', depthCalc: '0.00 m' };
}

function calculateInterval(records) {
    if (records.length < 2) return "Static";
    let totalDiff = 0, count = 0;
    for (let i = records.length - 1; i > Math.max(0, records.length - 4); i--) {
        if (records[i].date && records[i].time && records[i-1].date && records[i-1].time) {
            const diff = Math.abs(new Date(`${records[i].date} ${records[i].time}`) - new Date(`${records[i-1].date} ${records[i-1].time}`)) / 60000;
            if (!isNaN(diff) && diff < 1440) { totalDiff += diff; count++; }
        }
    }
    if (count === 0) return "Periodic";
    const avg = Math.round(totalDiff / count);
    return avg === 0 ? "<1m" : `${avg}m`;
}

function generate30DayTrend(records) {
    const dailyGroups = {};

    records.forEach(item => {
        if (!item.date) return;
        const groupKey = item.date; 

        if (!dailyGroups[groupKey]) {
            dailyGroups[groupKey] = { levelSum: 0, rainSum: 0, flowSum: 0, count: 0 };
        }

        dailyGroups[groupKey].levelSum += parseFloat(item.level) || 0;
        dailyGroups[groupKey].rainSum += parseFloat(item.rain) || 0;
        dailyGroups[groupKey].flowSum += parseFloat(item.flow) || 0;
        dailyGroups[groupKey].count++;
    });

    const sortedDates = Object.keys(dailyGroups).sort((a, b) => new Date(a) - new Date(b));
    const last30Dates = sortedDates.slice(-30);

    return {
        labels: last30Dates.map(d => {
            try {
                const parts = d.split('-');
                return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : d;
            } catch(e) { return d; }
        }),
        waterLevels: last30Dates.map(d => (dailyGroups[d].levelSum / dailyGroups[d].count).toFixed(2)),
        rainfalls: last30Dates.map(d => (dailyGroups[d].rainSum / dailyGroups[d].count).toFixed(1)),
        flowRates: last30Dates.map(d => (dailyGroups[d].flowSum / dailyGroups[d].count).toFixed(1))
    };
}

function updateColumnChart(elementsPrefix, records) {
    const trendData = generate30DayTrend(records);
    const canvasId = `inline-chart-${elementsPrefix}`;
    
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.labels,
            datasets: [
                {
                    label: 'Level',
                    data: trendData.waterLevels,
                    borderColor: '#198754',
                    borderWidth: 2,
                    tension: 0.15,
                    pointRadius: 1
                },
                {
                    label: 'Rain',
                    data: trendData.rainfalls,
                    borderColor: '#ffc107',
                    borderWidth: 1.5,
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: 'Flow',
                    data: trendData.flowRates,
                    borderColor: '#1c96c5',
                    borderWidth: 1.5,
                    tension: 0.1,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    display: true,
                    position: 'top',
                    labels: { boxWidth: 6, font: { size: 7.5 }, padding: 2 }
                } 
            },
            scales: {
                x: { 
                    display: true, 
                    grid: { display: false }, 
                    ticks: { font: { size: 7.5 }, maxTicksLimit: 6 } 
                },
                y: { display: true, ticks: { font: { size: 7.5 }, maxTicksLimit: 3 } }
            }
        }
    });
}

function bindStationNode(nodePath, elementsPrefix) {
    onValue(ref(db, nodePath), (snapshot) => {
        let records = [];
        if (snapshot.exists()) {
            const rawData = snapshot.val();
            
            if (typeof rawData === 'object' && rawData !== null) {
                records = Object.keys(rawData).map(k => {
                    const item = (typeof rawData[k] === 'object') ? rawData[k] : {};
                    return { ...item, __key: k };
                });
            } else if (Array.isArray(rawData)) {
                records = rawData.filter(item => item !== null);
            }
        }

        if (records.length === 0) {
            document.getElementById(`lvl-${elementsPrefix}`).innerText = '--';
            document.getElementById(`rain-${elementsPrefix}`).innerText = '--';
            document.getElementById(`flow-${elementsPrefix}`).innerText = '--';
            document.getElementById(`depth-${elementsPrefix}`).innerText = '--';
            document.getElementById(`time-${elementsPrefix}`).innerText = 'Offline';
            document.getElementById(`interval-${elementsPrefix}`).innerText = 'Int: None';
            document.getElementById(`status-${elementsPrefix}`).innerHTML = `<span class="badge-metric lvl-high">No Data</span>`;
            return;
        }
            
        records.sort((a, b) => {
            const dateA = a.date && a.time ? new Date(`${a.date} ${a.time}`) : new Date(Number(a.timestamp) || 0);
            const dateB = b.date && b.time ? new Date(`${b.date} ${b.time}`) : new Date(Number(b.timestamp) || 0);
            return dateA - dateB;
        });

        const current = records[records.length - 1]; 
        const meta = getDepthInfo(current.level);

        document.getElementById(`lvl-${elementsPrefix}`).innerText = current.level !== undefined ? `${current.level} m` : '--';
        document.getElementById(`rain-${elementsPrefix}`).innerText = current.rain !== undefined ? `${current.rain} mm` : '--';
        document.getElementById(`flow-${elementsPrefix}`).innerText = current.flow !== undefined ? `${current.flow} m³/s` : '--';
        document.getElementById(`depth-${elementsPrefix}`).innerText = current.level !== undefined ? meta.depthCalc : '--';
        document.getElementById(`time-${elementsPrefix}`).innerText = current.time || current.date || '--:--';
        document.getElementById(`interval-${elementsPrefix}`).innerHTML = `<i class="bi bi-clock"></i> Int: ${calculateInterval(records)}`;
        
        document.getElementById(`status-${elementsPrefix}`).innerHTML = `<span class="badge-metric ${meta.class}">${meta.label}</span>`;
        
        updateColumnChart(elementsPrefix, records);
    });
}