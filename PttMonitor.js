var http = require('http');
var nodemailer = require('nodemailer');
var request = require('request');
var request = request.defaults({
  jar: true
})
var cheerio = require('cheerio');
var fs = require('fs');
var publicIp = require('public-ip');

var target;
var smtpUser;
var smtpPwd;
var receiver;

var history = [];
var errFlag = false;

init();
// setInterval(init, 180000);

process.on('uncaughtException', function(err) {
  console.log("ERROR!");
  console.log(err);
  errFlag = true;
});

function init() {
  errFlag = false;
  var file = fs.readFileSync('./config.json');
  var hfile = fs.readFileSync('./history.json');
  config = JSON.parse(file);
  history = JSON.parse(hfile);

  target = config.target;
  smtpUser = config.smtpUser;
  smtpPwd = config.smtpPwd;
  receiver = config.receiver;
  // interval = config.interval;

  for (var k in target) {
    if (target[k].page == null)
      target[k].page = 3;

    if (target[k].threshold == null)
      target[k].threshold = 30;

    if (target[k].keywords == null)
      target[k].keywords = [];
  }

  request.post('https://www.ptt.cc/ask/over18', {
    form: {
      yes: 'yes',
      from: '/'
    }
  }, function(e, r, body) {
    flow(0);
  });
}

function flow(cur) {
  if (cur < target.length) {
    var board = target[cur];
    // console.log(board);
    getBoard(board, function() {
      flow(cur + 1);
    })
  } else {
    if (!errFlag) {
      // console.log(history);
      // console.log("send email ...");
      sendEmail();
      // console.log("clean ...");
      clean();
    }
  }
}

function getBoard(board, callback) {

  var url = board.url;
  var boardName = url.split('index')[0];
  var page = board.page;
  var keywords = board.keywords;
  var threshold = board.threshold;

  request(url, function(err, response, body) {

    if (body  === undefined || err || errFlag) {
      setKeep(boardName);
      callback();
      return;
    }

    $ = cheerio.load(body);
    var entry = [];
    $('.r-ent').each(function(i, elem) {
      var re = $('.nrec', this).text();
      var title = $('a', this).text();
      var link = "http://www.ptt.cc" + $('a', this).attr('href');
      // console.log(re) ;
      
      if(re.length == 0) 
        re = 0;

      if (re >= threshold || re == '爆' || haveKeywords(title, keywords)) {
        if (!inHistory(link)) {
          history.unshift({
            re: re,
            title: title,
            link: link,
            live: true,
            keep: false,
            sent: false,
            important: haveKeywords(title, keywords)
          });
        }
      }
      //console.log();
    })

    if (page > 1) {
      var path = $('.btn.wide', '.btn-group').eq(1).attr('href');
      var last = "http://www.ptt.cc" + path;
      board.url = last;

      if (path === undefined) {
        setKeep(boardName);
        callback();
        return;
      }

      else {
        board.page = page - 1;
        setTimeout(function() {
          getBoard(board, callback);
        }, 500)
      }
    } 
    else
      callback();
  });

}

function setKeep(boardName) {
  console.log(boardName + " ... ERROR!");
  for (var k in history) {
    if (!history[k].link.indexOf(boardName) > -1) {
      history[k].keep = true;  
    }
  }
}

function inHistory(link) {
  for (var k in history) {
    if (history[k].link == link) {
      history[k].live = true;
      return true;
    }
  }
  return false;
}

function haveKeywords(title, keywords) {
  for (k in keywords) {
    if (title.toLowerCase().indexOf(keywords[k]) > -1)
      return true;
  }
  return false;
}

function clean() {
  for (var k in history) {
    if (!history[k].live && !history[k].keep) {
      // console.log("delete ..." + history[k].title);
      history.splice(k, 1);
    }
  }
  for (var k in history) {
    history[k].live = false;
  }
  const stream = fs.createWriteStream('history.json');
  stream.write(JSON.stringify(history));
}

function sendEmail() {

  var context = "";
  var important = false;

  for (var k in history) {
    if (!history[k].sent) {
      context += history[k].title + "<br>";
      context += history[k].link + "<br>";
      context += history[k].re + "<br><br>";
      if (history[k].important)
        important = true;
      history[k].sent = true;
    }
  }

  if (context.length == 0)
    return;

  publicIp.v4(function(err, ip) {
    context += '<br>via &nbsp;' + ip;

    var transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: smtpUser,
        pass: smtpPwd
      }
    });

    var subject = 'PttMonitor';
    if (important)
      subject = 'PttMonitor(important!)';

    var mailOptions = {
      from: 'PttMonitor', // sender address
      to: receiver, // list of receivers
      subject: subject, // Subject line
      text: context, // plaintext body
      html: context // html body
    };

    transporter.sendMail(mailOptions, function(error, info) {
      if (error)
        console.log(error);
      else
        console.log('Message sent: ' + info.response);
    })
  })
}
