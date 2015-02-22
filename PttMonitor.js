var http = require('http');
var nodemailer = require('nodemailer');
var request = require('request');
var request = request.defaults({jar: true})
var cheerio = require('cheerio');
var fs = require('fs');


var target;
var smtpUser;
var smtpPwd;
var receiver;
var interval;

var history = [];
var errFlag = false;

init();

process.on('uncaughtException', function(err) {
  console.log("ERROR!");
  errFlag = true;
});

function init(){

  if(errFlag){
    return;
  }

  var file = fs.readFileSync('./config.json');
  config = JSON.parse(file);

  target = config.target;
  smtpUser = config.smtpUser;
  smtpPwd = config.smtpPwd;
  receiver = config.receiver;
  interval = config.interval;

  for(var k in target){
    if(target[k].page == null)
      target[k].page = 3;

    if(target[k].threshold == null)
      target[k].threshold = 30;

    if(target[k].keywords == null)
      target[k].keywords = [];
  }

  request.post('https://www.ptt.cc/ask/over18', {form:{yes:'yes',from:'/'}}, function(e, r, body){
    flow(0);
  });

}

function flow(cur){
  if(cur < target.length){
    var board = target[cur];
    getBoard(board, function(){
      flow(cur+1);
    })
  }
  else{
    // console.log(history);
    // for(var k in history){
    //   if(!history[k].sent){
    //     console.log(history[k].title);
    //     console.log(history[k].link);
    //     console.log(history[k].re);
    //     console.log();
    //     history[k].sent = true;
    //   }
    // }

    if(!errFlag){
      // console.log(history);
      console.log("send email ...");
      sendEmail();
      console.log("clean ...");
      clean();

    }
    setTimeout(function(){
      console.log("restart ...");
      errFlag = false;
      init();
    }, interval)
  }

}

function getBoard(board, callback){

  var url = board.url;
  var page = board.page;
  var keywords = board.keywords;
  var threshold = board.threshold;

  console.log(url);

  request(url,function(err,response,body){
    if(body === undefined || err || errFlag){
      console.log(url + " ... ERROR!");
      callback();
      return;
    }
    //console.log(body);
    $ = cheerio.load(body);
    var entry = [];
    $('.r-ent').each(function(i,elem){
      var re = $('.nrec',this).text();
      var title = $('a',this).text();
      var link = "http://www.ptt.cc" + $('a',this).attr('href');
      if(re > threshold || re == '爆' || haveKeywords(title, keywords)){
          if(!inHistory(link)){
            history.unshift(
              {
                re:re,
                title:title,
                link:link,
                live: true,
                sent:false
              }
            );
          }
      }
      //console.log();
    })

    if(page > 1){
      var last = "http://www.ptt.cc" + $('.btn.wide','.btn-group').eq(1).attr('href');
      board.url = last;
      board.page = page-1;
      setTimeout(function(){
        getBoard(board, callback);
      },500)
    }
    else
      callback();
  });

}

function inHistory(link){
  for(var k in history){
    if(history[k].link == link){
      history[k].live = true;
      return true;
    }
  }
  return false;
}

function haveKeywords(title, keywords){
  for(k in keywords){
    if(title.indexOf(keywords[k]) > -1)
      return true;
  }
  return false;
}

function clean(){
  for(var k in history){
    if(!history[k].live){
      console.log("delete ..." + history[k].title);
      history.splice(k,1);
    }
  }
  for(var k in history)
    history[k].live = false;
}


function sendEmail(){

  var context = "";
  for(var k in history){
    if(!history[k].sent){
      context += history[k].title + "<br>";
      context += history[k].link + "<br>";
      context += history[k].re + "<br><br>";
      history[k].sent = true;
    }
  }

  var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: smtpUser,
        pass: smtpPwd
    }
  });

  var mailOptions = {
      from: 'PttMonitor', // sender address
      to: receiver, // list of receivers
      subject: 'PttMonitor', // Subject line
      text: context, // plaintext body
      html: context // html body
  };

  if(context.length != 0){
    transporter.sendMail(mailOptions, function(error, info){
      if(error)
        console.log(error);
      else
        console.log('Message sent: ' + info.response);
    })
  }

}
