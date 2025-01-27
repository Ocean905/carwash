function doGet(e) {
  Logger.log("doGet called with parameters: " + JSON.stringify(e.parameter));
  
  var params = e.parameter;
  var callback = params.callback;
  
  try {
    var response;
    var spreadsheet;
    
    try {
      spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      if (!spreadsheet) {
        throw new Error("无法找到电子表格，请确保脚本已绑定到正确的表格");
      }
    } catch (error) {
      Logger.log("Error accessing spreadsheet: " + error.toString());
      throw new Error("访问电子表格失败：" + error.toString());
    }
    
    switch(params.action) {
      case 'getCloseCounterData':
        response = getCloseCounterData();
        break;
        
      case 'submitCloseCounter':
        var data = JSON.parse(decodeURIComponent(params.data));
        response = submitCloseCounter(data);
        break;
        
      case 'updatePayment':
        var success = updateSheetPayment(
          params.row,
          params.paymentType,
          params.amount
        );
        response = { success: success };
        break;
        
      case 'addNewEntry':
        // 处理新增记录
        Logger.log("Adding new entry with params:", params);
        try {
          if (!params.carNumber || !params.price) {
            throw new Error("Missing required parameters");
          }
          
          var success = addNewEntry(
            params.carNumber,
            params.member || '',
            params.price,
            params.via || ''
          );
          
          var response = {
            success: success,
            message: "Entry added successfully"
          };
          Logger.log("Add new entry response:", response);
        } catch (error) {
          Logger.log("Error adding new entry:", error);
          throw error;
        }
        break;
        
      case 'saveSalaryAdvance':
        var data = JSON.parse(decodeURIComponent(params.data));
        response = saveSalaryAdvance({parameter: {data: JSON.stringify(data)}});
        break;
        
      case 'getData':
        try {
          Logger.log("Starting getData operation");
          var sheet = spreadsheet.getSheetByName('DailyRecord');
          Logger.log("Sheet found: " + (sheet !== null));
          
          if (!sheet) {
            throw new Error("找不到 'DailyRecord' 工作表，请确保工作表名称正确");
          }
          
          // 确保范围存在
          var lastRow = Math.max(sheet.getLastRow(), 3);
          var range = sheet.getRange(`A3:R${lastRow}`);
          var data = range.getValues();
          
          // 检查并更新时间
          checkAndUpdateTime(sheet, data);
          
          // 重新获取更新后的数据
          data = range.getValues();
          
          response = {
            success: true,
            data: data,
            lastUpdate: new Date().getTime()
          };
        } catch (sheetError) {
          Logger.log("Detailed error: " + sheetError.stack);
          throw new Error("处理工作表时出错：" + sheetError.toString());
        }
        break;
        
      default:
        throw new Error("未知的操作类型");
    }
    
    return ContentService.createTextOutput()
      .setMimeType(ContentService.MimeType.JAVASCRIPT)
      .setContent(callback + "(" + JSON.stringify(response) + ")")
      .setHeaders({
        'Access-Control-Allow-Origin': 'https://stupendous-axolotl-b9585f.netlify.app',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
        'X-Content-Type-Options': 'nosniff'
      });
      
  } catch (error) {
    Logger.log("Error in doGet: " + error.toString());
    var errorResponse = {
      success: false,
      error: error.toString(),
      action: params.action,
      details: {
        spreadsheetId: spreadsheet ? spreadsheet.getId() : 'null',
        scriptId: ScriptApp.getScriptId()
      }
    };
    
    return ContentService.createTextOutput()
      .setMimeType(ContentService.MimeType.JAVASCRIPT)
      .setContent(callback + "(" + JSON.stringify(errorResponse) + ")")
      .setHeaders({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
  }
}

function doPost(e) {
  var response = ContentService.createTextOutput();
  response.setMimeType(ContentService.MimeType.JSON);
  
  // 添加 CORS 头
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  try {
    var data = JSON.parse(e.postData.contents);
    Logger.log("Received POST data: " + JSON.stringify(data));
    
    switch(data.action) {
      case 'addNewEntry':
        addNewEntry(data.carNumber, data.member, data.price, data.via);
        break;
      case 'updatePayment':
        updateSheetPayment(data.row, data.paymentType, data.amount);
        break;
      default:
        throw new Error('Unknown action: ' + data.action);
    }
    
    return response.setHeaders(headers)
                  .setContent(JSON.stringify({ success: true }));
  } catch (error) {
    Logger.log("Error in doPost: " + error.toString());
    return response.setHeaders(headers)
                  .setContent(JSON.stringify({ 
                    success: false, 
                    error: error.toString() 
                  }));
  }
}


function updateSheetPayment(row, paymentType, amount) {
  var sheet = SpreadsheetApp.getActiveSheet();
  
  Logger.log("Parameters received - row: " + row + ", paymentType: " + paymentType);
  
  try {
    // 只更新支付方式（H列是 Via）
    var rowNumber = parseInt(row) + 3;  // 确保 row 是数字
    Logger.log("Updating row number: " + rowNumber);
    
    var viaCell = sheet.getRange('H' + rowNumber);
    viaCell.setValue(paymentType);
    
    // 不再更新金额，因为 D 列包含公式
    
    Logger.log("Update completed successfully");
    return true;
  } catch (error) {
    Logger.log("Error in updateSheetPayment: " + error.toString());
    throw error;
  }
}

function addNewEntry(carNumber, member, price, via) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var dataRange = sheet.getRange('A3:P52');  // 获取所有可能的行
  var values = dataRange.getValues();
  
  // 找到第一个 C 列（索引 2）为空的行
  var targetRowIndex = -1;
  for (var i = 0; i < values.length; i++) {
    if (!values[i][2] || values[i][2].trim() === '') {
      targetRowIndex = i;
      break;
    }
  }
  
  if (targetRowIndex === -1) {
    throw new Error('没有找到空行');
  }
  
  Logger.log("Found empty row at index: " + targetRowIndex);
  var actualRow = targetRowIndex + 3;  // 加 3 因为我们从第 3 行开始
  
    try {
    // 更新到正确的列
    sheet.getRange(actualRow, 3).setValue(carNumber);    // C列 - Car Number
    sheet.getRange(actualRow, 6).setValue(price);        // F列 - Price
    sheet.getRange(actualRow, 8).setValue(via);         // H列 - Via
    sheet.getRange(actualRow, 13).setValue(member);      // M列 - Member
    sheet.getRange(actualRow, 15).setValue("top up");    // O列 - Remark
        
    SpreadsheetApp.flush();
    
    // 验证数据是否写入成功
    var writtenData = sheet.getRange(actualRow, 3).getValue();  // 检查 C 列
    if (writtenData === carNumber) {
      Logger.log("Data written successfully to row " + actualRow);
      return true;
    } else {
      Logger.log("Data write verification failed");
      throw new Error("Data write verification failed");
    }
    
  } catch (error) {
    Logger.log("Error in addNewEntry: " + error.toString());
    throw error;
  }
}


function getCloseCounterData() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DateClose');
    
    if (!sheet) {
      Logger.log("DateClose sheet not found");
      return {
        success: false,
        error: "DateClose sheet not found"
      };
    }
    
    // 获取 A2:G3 和 A4:G5 的数据
    var topRange = sheet.getRange('A2:G3').getValues();
    var bottomRange = sheet.getRange('A4:G5').getValues();
    
    // 构建返回的数据对象，确保数据结构完整
    var data = {
      top: {
        headers: topRange[0] || [],
        values: topRange[1] || []
      },
      bottom: {
        headers: bottomRange[0] || [],
        values: bottomRange[1] || []
      },
      moneyCount: {
        cash: sheet.getRange('M1').getValue() || 0,      // Cash
        coin: sheet.getRange('M2').getValue() || 0,      // Coin
        totalCash: sheet.getRange('M3').getValue() || 0  // Total Cash
      }
    };
    
    // 添加日志来检查数据结构
    Logger.log("Returning data structure: " + JSON.stringify(data));
    
    return {
      success: true,
      data: data
    };
    
  } catch (error) {
    Logger.log("Error in getCloseCounterData: " + error.toString());
    return {
      success: false,
      error: error.toString(),
      data: {  // 即使发生错误也返回一个有效的数据结构
        top: { headers: [], values: [] },
        bottom: { headers: [], values: [] },
        moneyCount: {
          cash: 0,
          coin: 0,
          totalCash: 0
        }
      }
    };
  }
}

function submitCloseCounter(data) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DateClose');
    
    if (!sheet) {
      Logger.log("DateClose sheet not found");
      return {
        success: false,
        error: "DateClose sheet not found"
      };
    }

    // 更新 Money Count 数据到 DateClose 表
    sheet.getRange('M1').setValue(data.money.cash || 0);      // Cash
    sheet.getRange('M2').setValue(data.money.coin || 0);      // Coin
    
    SpreadsheetApp.flush();
    
    return {
      success: true
    };
    
  } catch (error) {
    Logger.log("Error in submitCloseCounter: " + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

function saveSalaryAdvance(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DateClose');
    
    if (!sheet) {
      Logger.log("DateClose sheet not found");
      return {
        success: false,
        error: "DateClose sheet not found"
      };
    }

    var data = JSON.parse(e.parameter.data);
    
    // 更新 J2:J5 的工资数据
    sheet.getRange('J2').setValue(data.kent || 0);      // Kent
    sheet.getRange('J3').setValue(data.dainel || 0);    // Dainel
    sheet.getRange('J4').setValue(data.saleem || 0);    // Saleem
    sheet.getRange('J5').setValue(data.min || 0);       // Min
    
    SpreadsheetApp.flush();
    
    return {
      success: true
    };
    
  } catch (error) {
    Logger.log("Error in saveSalaryAdvance: " + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

function checkAndUpdateTime(sheet, data) {
  try {
    // 获取当前时间并格式化为 HH:mm
    var now = new Date();
    var hours = now.getHours().toString().padStart(2, '0');
    var minutes = now.getMinutes().toString().padStart(2, '0');
    var timeString = `${hours}:${minutes}`;
    
    // 遍历数据，检查 B 列和 R 列
    data.forEach((row, index) => {
      try {
        // B 列是第 2 列 (index 1)，R 列是第 18 列 (index 17)
        var carNumber = row[1]; // B 列的值
        var timeStamp = row[17]; // R 列的值
        
        // 如果 B 列有值但 R 列为空
        if (carNumber && carNumber.trim() !== '' && (!timeStamp || timeStamp.trim() === '')) {
          // 更新 R 列的时间，实际行号需要加 3（因为数据从 A3 开始）
          var actualRow = index + 3;
          var cell = sheet.getRange('R' + actualRow);
          cell.setValue(timeString);
          
          // 设置单元格格式为纯文本，避免被识别为日期
          cell.setNumberFormat('@');
        }
      } catch (rowError) {
        Logger.log("Error processing row " + index + ": " + rowError.toString());
      }
    });
  } catch (error) {
    Logger.log("Error in checkAndUpdateTime: " + error.toString());
    throw error;
  }
} 