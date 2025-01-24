// Google Apps Script Web App URL
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz5AjRQSMdr5O0h8tRR_sol5bJ1UDVl7UnA3u7rEy88PLT3m7b6N7vPYBPltlNT4SSDAQ/exec';

let currentRow; // 在文件顶部添加这个全局变量
let refreshInterval;
let lastUpdateTime = 0; // 添加在文件顶部，用于追踪上次更新时间

// 获取表格数据
function fetchSheetData() {
    // 添加刷新状态指示
    const refreshBtn = document.querySelector('.btn.refresh');
    if (refreshBtn) {
        refreshBtn.classList.add('refreshing');
    }

    const script = document.createElement('script');
    const timestamp = new Date().getTime();
    const callbackName = 'handleResponse_' + timestamp;
    
    window[callbackName] = function(data) {
        handleResponse(data);
        // 移除刷新状态
        if (refreshBtn) {
            refreshBtn.classList.remove('refreshing');
        }
        delete window[callbackName];
        document.body.removeChild(script);
    };
    
    script.src = `${SCRIPT_URL}?action=getData&callback=${callbackName}&_=${timestamp}`;
    script.onerror = function() {
        console.error('Script load error');
        alert('获取数据失败: 脚本加载错误');
        if (refreshBtn) {
            refreshBtn.classList.remove('refreshing');
        }
        delete window[callbackName];
        document.body.removeChild(script);
    };
    
    document.body.appendChild(script);
}

function handleResponse(data) {
    console.log('Received response:', data);
    if (data && data.success) {
        // 检查是否有新数据
        if (data.lastUpdate > lastUpdateTime) {
            console.log('New data detected, updating table...');
            updateTableFromSheet(data.data);
            lastUpdateTime = data.lastUpdate;
        } else {
            console.log('No new data detected');
        }
    } else {
        console.error('Error:', data ? data.error : 'No data received');
        alert('获取数据失败: ' + (data ? data.error : '未收到数据'));
    }
}

// 添加更新表格的函数
function updateTableFromSheet(data) {
    const tbody = document.getElementById('carWashData');
    tbody.innerHTML = '';
    
    data.forEach((row, index) => {
        if (row[2] && row[2].trim() !== '') {
            const servicePerson = row[8] || '';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row[0] || ''}</td>
                <td>${row[2] || ''}</td>
                <td>${row[3] || ''}</td>
                <td>${row[7] || ''}</td>
                <td>${servicePerson}</td>
                <td>${row[12] || ''}</td>
                <td>${row[13] || ''}</td>
                <td>${row[11] || ''}</td>
                <td>${row[17] || ''}</td>
            `;
            tbody.appendChild(tr);
            
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', function() {
                console.log('Row clicked:', index);
                showPaymentForm(index);
            });
        }
    });

    calculateTotalAmount();
}

function showPaymentForm(row) {
    console.log('Showing payment form for row:', row);
    currentRow = row;
    const modal = document.getElementById('paymentModal');
    const totalAmountInput = document.getElementById('totalAmount');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const paymentTypeSelect = document.getElementById('paymentType');
    const changeAmountInput = document.getElementById('changeAmount');

    // 获取所有行
    const rows = document.querySelectorAll('#carWashData tr');
    const selectedRow = rows[row];
    if (!selectedRow) {
        console.error('Row not found:', row);
        return;
    }

    const carNumber = selectedRow.children[1].textContent.trim(); // 获取车牌号
    const remark = selectedRow.children[5].textContent.trim(); // 获取 remark
    let totalAmount = 0;

    // 如果是 top up，只使用当前行的金额
    if (remark === 'top up') {
        totalAmount = parseFloat(selectedRow.children[2].textContent.trim()) || 0;
    } else {
        // 如果不是 top up，遍历所有行查找相同车牌号且不是 top up 的记录
        rows.forEach((row) => {
            const rowCarNumber = row.children[1].textContent.trim();
            const rowRemark = row.children[5].textContent.trim();
            const rowAmount = parseFloat(row.children[2].textContent.trim()) || 0;

            if (rowCarNumber === carNumber && rowRemark !== 'top up') {
                totalAmount += rowAmount;
            }
        });
    }

    console.log('Total amount:', totalAmount);
    totalAmountInput.value = totalAmount.toFixed(2);

    // 设置付款方式
    const firstPaymentType = selectedRow.children[3].textContent.trim();
    paymentTypeSelect.value = firstPaymentType;

    // 添加实时更新事件监听器
    paymentAmountInput.addEventListener('input', function() {
        calculateChange();
    });

    paymentTypeSelect.addEventListener('change', function() {
        // 如果选择了 Package、B 或 T，自动设置付款金额等于总金额
        const selectedType = this.value;
        if (selectedType === 'Package' || selectedType === 'B' || selectedType === 'T') {
            paymentAmountInput.value = totalAmount.toFixed(2);
            calculateChange();
        }
    });

    modal.style.display = 'block';
}

function closePaymentForm() {
    const modal = document.getElementById('paymentModal');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const paymentTypeSelect = document.getElementById('paymentType');
    
    // 移除事件监听器
    paymentAmountInput.removeEventListener('input', calculateChange);
    paymentTypeSelect.removeEventListener('change', null);
    
    modal.style.display = 'none';
    clearForms();
}

function showNewEntryForm() {
    const modal = document.getElementById('newEntryModal');
    modal.style.display = 'block';
}

function closeNewEntryModal() {
    const modal = document.getElementById('newEntryModal');
    modal.style.display = 'none';
    clearForms();  // 清空表单
}

async function submitNewEntry() {
    const carNumber = document.getElementById('newCarNumber').value;
    const member = document.getElementById('newMember').value;
    const price = document.getElementById('newPrice').value;
    const via = document.getElementById('newVia').value;
    
    if (!carNumber || !price) {
        alert('请输入车牌号和价格');
        return;
    }
    
    console.log('Adding new entry:', {
        carNumber: carNumber,
        member: member,
        price: price,
        via: via
    });
    
    try {
        const callbackName = 'newEntryCallback_' + new Date().getTime();
        
        const responsePromise = new Promise((resolve, reject) => {
            window[callbackName] = function(response) {
                console.log('New entry response received:', response);
                resolve(response);
                delete window[callbackName];
                document.body.removeChild(script);
            };
            
            const script = document.createElement('script');
            const url = `${SCRIPT_URL}?action=addNewEntry&callback=${callbackName}&carNumber=${encodeURIComponent(carNumber)}&member=${encodeURIComponent(member)}&price=${encodeURIComponent(price)}&via=${encodeURIComponent(via)}`;
            console.log('Request URL:', url);
            
            script.src = url;
            script.onerror = () => {
                console.error('Script load error');
                reject(new Error('Script load error'));
                delete window[callbackName];
                document.body.removeChild(script);
            };
            document.body.appendChild(script);
        });
        
        const result = await responsePromise;
        
        if (!result.success) {
            throw new Error(result.error || '添加记录失败');
        }
        closeNewEntryModal();
        clearForms();
        await fetchSheetData();
        calculateTotalAmount();
    } catch (error) {
        console.error('Error:', error);
        alert('添加记录失败');
    }
}

function calculateChange() {
    const totalAmount = parseFloat(document.getElementById('totalAmount').value) || 0;
    const paymentAmount = parseFloat(document.getElementById('paymentAmount').value) || 0;
    const changeAmount = paymentAmount - totalAmount;
    
    // 更新找零金额
    document.getElementById('changeAmount').value = changeAmount.toFixed(2);
    
    // 如果付款金额小于总金额，显示警告
    const paymentInput = document.getElementById('paymentAmount');
    if (paymentAmount < totalAmount) {
        paymentInput.style.borderColor = 'red';
    } else {
        paymentInput.style.borderColor = '';
    }
}

async function submitPayment() {
    const paymentType = document.getElementById('paymentType').value;
    const paymentAmount = document.getElementById('paymentAmount').value;

    console.log('Submitting payment:', {
        row: currentRow,
        paymentType: paymentType,
        amount: paymentAmount
    });

    try {
        const callbackName = 'paymentCallback_' + new Date().getTime();
        
        // 先更新選中行的付款方式
        const responsePromise = new Promise((resolve, reject) => {
            window[callbackName] = function(response) {
                console.log('Payment response received:', response);
                resolve(response);
                delete window[callbackName];
                document.body.removeChild(script);
            };

            const script = document.createElement('script');
            const url = `${SCRIPT_URL}?action=updatePayment&callback=${callbackName}&row=${currentRow}&paymentType=${paymentType}&amount=${paymentAmount}`;
            console.log('Request URL:', url);

            script.src = url;
            script.onerror = () => {
                console.error('Script load error');
                reject(new Error('Script load error'));
                delete window[callbackName];
                document.body.removeChild(script);
            };
            document.body.appendChild(script);
        });

        const result = await responsePromise;

        if (!result.success) {
            throw new Error(result.error || '更新付款方式失败');
        }

        // 更新其他相同车牌号的记录
        const rows = document.querySelectorAll('#carWashData tr');
        const carNumber = rows[currentRow].children[1].textContent.trim();

        rows.forEach((row, index) => {
            const rowCarNumber = row.children[1].textContent.trim();
            if (rowCarNumber === carNumber && index !== currentRow) {
                updatePaymentForRow(index, paymentType, paymentAmount);
            }
        });

        closePaymentForm();
        clearForms();
        await fetchSheetData();
        calculateTotalAmount();
    } catch (error) {
        console.error('Error:', error);
        alert('更新付款方式失败');
    }
}

// 更新特定行的付款方式
function updatePaymentForRow(rowIndex, paymentType, paymentAmount) {
    const callbackName = 'updatePaymentCallback_' + new Date().getTime();

    window[callbackName] = function(response) {
        console.log('Row payment updated:', response);
        delete window[callbackName];
    };

    const script = document.createElement('script');
    const url = `${SCRIPT_URL}?action=updatePayment&callback=${callbackName}&row=${rowIndex}&paymentType=${paymentType}&amount=${paymentAmount}`;
    script.src = url;
    document.body.appendChild(script);
}


function showCloseCounter() {
    const modal = document.getElementById('closeCounterModal');
    const summaryStep = document.getElementById('summaryTableStep');
    
    // 直接显示汇总表格
    modal.style.display = 'block';
    summaryStep.style.display = 'block';
    
    // 获取并显示汇总数据
    fetchCloseCounterData();
}

function submitSalaryAdvance() {
    const salaryData = {
        kent: document.getElementById('salaryKent').value,
        dainel: document.getElementById('salaryDainel').value,
        saleem: document.getElementById('salarySaleem').value,
        min: document.getElementById('salaryMin').value
    };
    
    // 保存 salary advance 数据
    saveSalaryAdvance(salaryData);
    
    // 隐藏第一步，显示第二步
    document.getElementById('salaryAdvanceStep').style.display = 'none';
    document.getElementById('summaryTableStep').style.display = 'block';
    
    // 设置金额输入监听器
    setupMoneyCountListeners();
    
    // 获取并显示汇总数据
    fetchCloseCounterData();
}

function saveSalaryAdvance(data) {
    const callbackName = 'saveSalaryCallback_' + new Date().getTime();
    
    window[callbackName] = function(response) {
        if (!response.success) {
            console.error('Error:', response.error);
            alert('保存失败');
        }
        delete window[callbackName];
    };
    
    const script = document.createElement('script');
    script.src = `${SCRIPT_URL}?action=saveSalaryAdvance&callback=${callbackName}&data=${encodeURIComponent(JSON.stringify(data))}`;
    document.body.appendChild(script);
}

function closeCounterModal() {
    const modal = document.getElementById('closeCounterModal');
    modal.style.display = 'none';
}

function fetchCloseCounterData() {
    const callbackName = 'closeCounterCallback_' + new Date().getTime();
    
    window[callbackName] = function(response) {
        console.log('Received close counter data:', response);
        
        if (response.success) {
            if (!response.data) {
                console.error('No data received in response');
                alert('获取数据失败：没有收到数据');
                return;
            }
            
            try {
                updateCloseCounterTable(response.data);
                updateCloseCounterDisplay(response);
            } catch (error) {
                console.error('Error updating table:', error);
                alert('更新表格时出错：' + error.message);
            }
        } else {
            console.error('Error:', response.error);
            alert('获取数据失败：' + (response.error || '未知错误'));
        }
        
        delete window[callbackName];
        document.body.removeChild(document.querySelector(`script[src*="${callbackName}"]`));
    };
    
    const script = document.createElement('script');
    script.src = `${SCRIPT_URL}?action=getCloseCounterData&callback=${callbackName}`;
    script.onerror = function() {
        console.error('Script load error');
        alert('获取数据失败：脚本加载错误');
        delete window[callbackName];
    };
    
    document.body.appendChild(script);
}

function updateCloseCounterTable(data) {
    const tbody = document.getElementById('closeCounterData');
    
    // 添加数据验证
    if (!data || !data.top || !data.bottom) {
        console.error('Invalid data structure:', data);
        return;
    }
    
    // 格式化数字的辅助函数
    function formatValue(value) {
        if (typeof value === 'number') {
            return value.toFixed(2);
        }
        return value || '';
    }
    
    try {
        tbody.innerHTML = `
            <!-- 显示 A2:G3 的数据 -->
            <tr>
                ${(data.top.headers || []).map(value => `<td>${formatValue(value)}</td>`).join('')}
            </tr>
            <tr>
                ${(data.top.values || []).map(value => `<td>${formatValue(value)}</td>`).join('')}
            </tr>
            <!-- 添加空行 -->
            <tr><td colspan="7">&nbsp;</td></tr>
            <!-- 显示 A4:G5 的数据 -->
            <tr>
                ${(data.bottom.headers || []).map(value => `<td>${formatValue(value)}</td>`).join('')}
            </tr>
            <tr>
                ${(data.bottom.values || []).map(value => `<td>${formatValue(value)}</td>`).join('')}
            </tr>
        `;
    } catch (error) {
        console.error('Error updating table:', error);
        tbody.innerHTML = '<tr><td colspan="7">Error loading data</td></tr>';
    }
}

async function submitCloseCounter() {
    const data = {
        money: {
            cash: document.getElementById('moneyCash').value,
            coin: document.getElementById('moneyCoin').value,
            pettyCash: document.getElementById('moneyPettyCash').value
        }
    };
    
    try {
        const callbackName = 'submitCloseCounterCallback_' + new Date().getTime();
        
        const responsePromise = new Promise((resolve, reject) => {
            window[callbackName] = function(response) {
                resolve(response);
                delete window[callbackName];
                document.body.removeChild(script);
            };
            
            const script = document.createElement('script');
            script.src = `${SCRIPT_URL}?action=submitCloseCounter&callback=${callbackName}&data=${encodeURIComponent(JSON.stringify(data))}`;
            script.onerror = () => {
                reject(new Error('Script load error'));
                delete window[callbackName];
                document.body.removeChild(script);
            };
            document.body.appendChild(script);
        });
        
        const result = await responsePromise;
        
        if (!result.success) {
            throw new Error(result.error || '提交失败');
        }
        closeCounterModal();
        fetchSheetData();
    } catch (error) {
        console.error('Error:', error);
        alert('提交失败');
    }
}

function updateCloseCounterDisplay(response) {
    if (response.data.moneyCount) {
        document.getElementById('moneyCash').value = 
            response.data.moneyCount.cash ? 
            response.data.moneyCount.cash.toFixed(2) : '';
        document.getElementById('moneyCoin').value = 
            response.data.moneyCount.coin ? 
            response.data.moneyCount.coin.toFixed(2) : '';
        document.getElementById('moneyPettyCash').value = 
            response.data.moneyCount.pettyCash ? 
            response.data.moneyCount.pettyCash.toFixed(2) : '';
    }
}

// 简化监听器设置
function setupMoneyCountListeners() {
    // 移除所有监听器，因为不需要自动计算
}

// 添加计算总金额的函数
function calculateTotalAmount() {
    const rows = document.querySelectorAll('#carWashData tr');
    let totalAmount = 0;

    rows.forEach(row => {
        const amount = parseFloat(row.children[2].textContent.trim()) || 0;
        totalAmount += amount;
    });

    // 更新显示
    const totalDisplay = document.getElementById('totalDayAmount');
    totalDisplay.textContent = `RM ${totalAmount.toFixed(2)}`;
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    fetchSheetData();
    // 每 5 秒刷新一次数据
    refreshInterval = setInterval(fetchSheetData, 5000);
    
    // 添加页面关闭时的清理
    window.addEventListener('beforeunload', function() {
        cleanupInterval();
    });
});

// 添加清理函数（在适当的地方调用，比如页面关闭时）
function cleanupInterval() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

// 添加手动刷新按钮的功能
function refreshData() {
    fetchSheetData();
}

// 添加新的 Salary 相关函数
function showSalaryForm() {
    const modal = document.getElementById('salaryModal');
    modal.style.display = 'block';
}

function closeSalaryModal() {
    const modal = document.getElementById('salaryModal');
    modal.style.display = 'none';
    clearForms();
}

async function submitSalary() {
    const salaryData = {
        kent: document.getElementById('salaryKent').value,
        dainel: document.getElementById('salaryDainel').value,
        saleem: document.getElementById('salarySaleem').value,
        min: document.getElementById('salaryMin').value
    };
    
    try {
        await saveSalaryAdvance(salaryData);
        closeSalaryModal();
    } catch (error) {
        console.error('Error:', error);
        alert('保存失败');
    }
} 