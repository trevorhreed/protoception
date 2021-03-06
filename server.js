var express = require('express'),
    connectlr = require('connect-livereload'),
    bodyParser = require('body-parser'),
    fs = require('fs'),
    path = require('path'),
    spahql = require('spahql'),
    uuid = require('node-uuid'),
    urljoin = require('url-join')
;

var LR_PORT         = 35729;

function handle(method){
  return function(req, res){
    var file = path.join(__dirname, 'data.json')
    fs.readFile(file, function(err, data){

      if(err){
        console.log(err);
        res.status(500).end();
        return;
      }

      try {

        var url = req.path.substr(5),
            db = spahql.db(JSON.parse(data)),
            node = db.select(url);
            value = method(node, url, db, req.body);

        json = JSON.stringify(db.sourceData(), null, 2);
        fs.writeFile(file, json);
        res.json(value);

      } catch(ex) {
        console.log(ex);
        res.status(500).end();
        return;
      }

    });
  }
}

function ensureNodeExists(url, db){
  if(!db.assert(url)){
    var nodes = url.split('/'),
        prev = '/';
    for(var i=0; i < nodes.length; i++){
      var node = nodes[i],
          next = urljoin(prev, node);
      if(!db.assert(next)){
        db.select(prev).set(node, {});
      }
      prev = next;
    }
  }
  return db.select(url);
}

function get(node, url, db, entity){
  return node.value();
}
function put(node, url, db, entity){
  var index = url.lastIndexOf('/') + 1,
      location = url.substr(0, index),
      key = url.substr(index);
  ensureNodeExists(location, db);
  return db.select(location).set(key, entity).select('/' + key).value();
}
function post(node, url, db, entity){
  var key = uuid.v4();
  entity.$key = key;
  node = ensureNodeExists(url, db);
  return node.set(key, entity).select('/' + key).value();
}
function del(node, url, db, entity){
  var item = node.value();
  node.destroy(undefined);
  return item;
}

function getContent(finished){
  var dir = __dirname + '/data/people/';
  fs.readdir(dir, function(err, files){
    if(err){
      finished('Failed to read directory contents: ' + err, []);
      return;
    }
    var count = files.length,
        contents = [];
    files.forEach(function(file, index){
      var failed = false;
      fs.readFile(dir + file, function(err, data){
        if(failed) return;
        if(err){
          failed = true;
          finished('Failed to read file contents: ' + err, []);
          return;
        }
        contents[index] = data;
        if(contents.length == count){
          finished(null, contents);
        }
      })
    });
  });
}

function getPeople(req, res){
  console.time('test');
  getContent(function(err, content){
    console.timeEnd('test');
    res.send('[' + content.join(',') + ']');
  });
}

var app = express();
app
    .use(bodyParser.json())
    .get('/people', getPeople)
    .get('/data/*', handle(get))
    .put('/data/*', handle(put))
    .post('/data/*', handle(post))
    .delete('/data/*', handle(del))
    .use(connectlr({'port': LR_PORT}))
    .use(express.static('static'))
    .listen(3000);
