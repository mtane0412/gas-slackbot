/*
使用ライブラリ
SlackApp ver.22
Moment ver.9
*/

var prop = PropertiesService.getScriptProperties();

function postMessage(channelID, message, options) {
  var slackApp = SlackApp.create(prop.getProperty('SLACK_OAUTH_TOKEN'));
  var channelId = channelID;
  var message = message;
  var options = options;

  slackApp.postMessage(channelId, message, options);
}

function doPost(e) {
  var postData = JSON.parse(e.postData.getDataAsString());
  var res = {};
  if (postData.type === 'url_verification') {
    res.challenge = postData.challenge;
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }

  if (postData.type === 'nasne' && postData.token === prop.getProperty('NASNE_TOKEN')) {
    try {
      nasneSlackPost(postData);
      res.message = "リクエストは正常に送信されました。";
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      res.message = "リクエストは送信できませんでした。"
      res.error = error;
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (prop.getProperty('SLACK_VERIFICATION_TOKEN') != postData.token) {
    throw new Error("invalid token.");
  }

  if (postData.event.type == 'app_mention' && postData.event.subtype != 'bot_message') {
    if (postData.event.text.match(/路面|道路|凍結/) != null) {
      checkRoad(postData.event.channel);
    } else {
      var text = "怒気あって真の勇気なき小人め、語るにたらん";
      postMessage('C9B2GCZ5J', text);
    }
  }

  return;
}

function doGet(e) {
  doPost(e);
}

function nasneSlackPost(postData) {
  var postData = postData;

  // Slack postのオプション
  var options = {
    username: "トルネフ",
    icon_url: prop.getProperty('TORNEV_ICON'),
    attachments: null
  };
  var programs = postData.titleList;
  console.log(programs);

  var SpreadSheet = SpreadsheetApp.openById(prop.getProperty('NASNE_SHEET_ID'))

  // 録画リスト作成 & 新着録画通知
  var nasneSheet = SpreadSheet.getSheetByName('nasne番組表');
  nasneSheet.getDataRange().clear(); // 初期化
  var values = [
    ['id', 'startDateTime', 'title', 'description', 'duration']
  ];
  for (var i = 0; i < programs.length; i++) {
    values.push([programs[i].id, programs[i].startDateTime, programs[i].title, programs[i].description, programs[i].duration]);
    if (Moment.moment().diff(Moment.moment(programs[i].startDateTime), 'hours') <= 1 && !postData.nowId) {
      var text = "nasneに番組が追加されたみたいですー！";
      var startTime = Moment.moment(programs[i].startDateTime);
      var endTime = Moment.moment(programs[i].startDateTime).add(programs[i].duration, 'seconds');
      options.attachments = JSON.stringify({
        color: 'good',
        author_name: "nasne番組表",
        author_link: "https://docs.google.com/spreadsheets/d/" + prop.getProperty('NASNE_SHEET_ID') + "/",
        title: programs[i].title,
        text: programs[i].description,
        fields: [{
            "title": "開始時刻",
            "value": startTime.add(1, 'minutes').format('HH:mm'),
            "short": true
          },
          {
            "title": "終了時刻",
            "value": endTime.format('HH:mm'),
            "short": true
          },
          {
            "title": "放送時間",
            "value": Math.floor(programs[i].duration / 60) + "分",
            "short": true
          },
          {
            "title": "HDD残容量",
            "value": postData.HDD.remainVolumePercentage + "%",
            "short": true
          }
        ]
      })
      postMessage('C8FDF6XK8', text, options);
    }
  }
  nasneSheet.getRange(1, 1, values.length, 5).setValues(values); // シートを同期
  console.log("録画 %s 件", values.length);

  // HDD情報同期
  var hddSheet = SpreadSheet.getSheetByName('HDDInfo');
  var lastData = hddSheet.getRange('A2:D2').getValues()[0];
  var currentData = [postData.HDD.freeVolumeSize, postData.HDD.usedVolumeSize, postData.HDD.totalVolumeSize, postData.HDD.remainVolumePercentage];
  var attachments = {
    title: "nasne HDDアラート",
    fields: [{
        "title": "ストレージの残量",
        "value": postData.HDD.remainVolumePercentage + "%",
        "short": true
      },
      {
        "title": "空きHDD容量",
        "value": postData.HDD.freeVolumeSize + "GB",
        "short": true
      },
      {
        "title": "使用済みHDD容量",
        "value": postData.HDD.usedVolumeSize + "GB",
        "short": true
      },
      {
        "title": "nasne内蔵HDD容量",
        "value": postData.HDD.totalVolumeSize + "GB",
        "short": true
      }
    ]
  };
  if (lastData[3] >= 10 && currentData[3] < 10) {
    var text = "nasneのHDDが10%を切りましタ。容量がなくなると新規録画に失敗するノデ、ご注意くださいね。";
    attachments.color = 'warning';
    options.attachments = JSON.stringify(attachments);
    postMessage('C8FDF6XK8', text, options);
    console.log('HDD Alert(10%)を送信しました。')
  } else if (lastData[3] >= 5 && currentData[3] < 5) {
    var text = "ア゛ー! nasneのHDDが5%を切りましタ!! 急いで録画の整理をおすすめします！";
    attachments.color = 'danger';
    options.attachments = JSON.stringify(attachments);
    postMessage('C8FDF6XK8', text, options);
    console.log('HDD Alert(5%)を送信しました。')
  } else;
  hddSheet.getRange('A2:D2').setValues([currentData]); // シートを同期
  console.log("HDDInfoを同期しました。残り" + postData.HDD.remainVolumePercentage + "%")
  return;
}

function checkRoad(channelID) {
  var response = UrlFetchApp.fetch("http://road.thr.mlit.go.jp/info/romen/way/way045.html")
  var html = response.getContentText("shift-jis");
  var regexTR = /<TR>\s?([\s\S]*?)\s?<\/TR>/g;
  var regexTD = /<TD[\s\S]*?>\s?([\s\S]*?)\s?<\/TD>/g;
  var tr_result = html.match(regexTR);
  var result = [];

  while ((tr = regexTR.exec(html)) != null) {
    var tds = [];
    while ((td = regexTD.exec(tr[1])) != null) {
      tds.push(td[1].replace(/\s+/g, "")); // 余分なスペースは削除
    }
    result.push(tds)
  }

  var ofunato = 1; // 大船渡市のインデックス
  var text = "閣下、現在大船渡市国道45号線の路面は *" + result[ofunato][2] + "* しているようです。";
  var attachments = {
    attachments: JSON.stringify([{
      color: 'good',
      title: "東北地方道路情報提供システム",
      title_link: "http://road.thr.mlit.go.jp/info/romen/way/way045.html", //そのリンク
      text: result[ofunato][5] + "時点の路面情報です。", //インデント内に表示されるテスト,
      fields: [{
        "title": "観測場所",
        "value": result[ofunato][1],
        "short": true
      }, {
        "title": "路面状況",
        "value": result[ofunato][2],
        "short": true
      }, {
        "title": "気温",
        "value": result[ofunato][4] + "℃",
        "short": true
      }, {
        "title": "路温",
        "value": result[ofunato][3] + "℃",
        "short": true
      }],
      footer: "東北地方道路情報提供システム"
    }])
  };
  postMessage(channelID, text, attachments);
}