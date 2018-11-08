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
  console.log(e);
  var postData = JSON.parse(e.postData.getDataAsString());
  var res = {};
  console.log(postData);
  if (postData.type == 'url_verification') {
    res = {
      'challenge': postData.challenge
    };
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }
  console.log('postData.type: %s', postData.type);
  console.log('postData.token: %s', postData.token);

  if (postData.type == 'nasne' && postData.token == PropertiesService.getScriptProperties().getProperty('NASNE_TOKEN')) {
    if (postData.endpoint === "titleListGet") {
      var programs = postData.body.item;
      nasneList(programs);
      return;
    } else if (postData.endpoint === "HDDInfoGet") {
      var text = "nasneのHDDが残り少ないです。不要な録画を削除してください。";
      var options = {
        username: "トルネフ",
        icon_url: prop.getProperty('TORNEV_ICON'),
        attachments: JSON.stringify([{
          color: 'danger',
          title: "nasne HDD情報",
          fields: [{
              "title": "ストレージの残量",
              "value": postData.body.HDD.remainVolumePercentage + "%",
              "short": true
            },
            {
              "title": "空きHDD容量",
              "value": postData.body.HDD.freeVolumeSize + "GB",
              "short": true
            },
            {
              "title": "使用済みHDD容量",
              "value": postData.body.HDD.usedVolumeSize + "GB",
              "short": true
            },
            {
              "title": "nasne内蔵HDD容量",
              "value": postData.body.HDD.otalVolumeSize + "GB",
              "short": true
            }
          ]
        }])
      };
      postMessage('C8FDF6XK8', text, options);
      return;
    } else {
      throw new Error("Unknown endpoint from nasne-checker.");
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

function nasneList(programs) {
  /*
  nasne番組表シートを更新
  1時間以内の番組があればSlackにpost
  */
  var nasneSheet = SpreadsheetApp.openById(prop.getProperty('NASNE_SHEET_ID')).getSheetByName('nasne番組表');
  nasneSheet.getDataRange().clear(); // 初期化
  var values = [
    ['id', 'startDateTime', 'title', 'description', 'duration']
  ];
  for (var i = 0; i < programs.length; i++) {
    values.push([programs[i].id, programs[i].startDateTime, programs[i].title, programs[i].description, programs[i].duration])
    if (Moment.moment().diff(Moment.moment(programs[i].startDateTime), 'hours') <= 1) {
      var text = "nasneに番組が追加されたみたいですー！";
      var startTime = Moment.moment(programs[i].startDateTime);
      var endTime = Moment.moment(programs[i].startDateTime).add(programs[i].duration, 'seconds');
      var options = {
        username: "トルネフ",
        icon_url: prop.getProperty('TORNEV_ICON'),
        attachments: JSON.stringify([{
          color: 'good',
          author_name: "nasne番組表",
          author_link: "https://docs.google.com/spreadsheets/d/" + prop.getProperty('NASNE_SHEET_ID') + "/",
          title: programs[i].title,
          text: programs[i].description, //インデント内に表示されるテスト,
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
            }
          ]
        }])
      };
      postMessage('C8FDF6XK8', text, options);
    }
  }
  nasneSheet.getRange(1, 1, values.length, 5).setValues(values);
  return console.log('録画%s件', values.length);
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