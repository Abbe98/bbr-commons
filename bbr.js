(function(mw, $) {
  function validateUri(uri, callback) {
    var url = 'https://tools.wmflabs.org/ksamsok-rest/records/' + uri;
    
    var http = new XMLHttpRequest();
    http.open('HEAD', url);

    http.onreadystatechange = function() {
      if (http.readyState == http.DONE) {
        if (http.status == 200) {
          callback(true);
        } else {
          callback(false);
        }
      }
    };
    http.send();
  }

  function getCsrfToken(callback) {
    var url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&meta=tokens&type=csrf';
    $.ajax({
        url: url,
        success: function(response) {
          callback(response.query.tokens.csrftoken);
        }
    });
  }

  function getUri(localId, callback) {
    var typeOld = 'raa/bbr/' + localId;
    var typeA = 'raa/bbra/' + localId;

    if (parseInt(localId) < 21300000000000) {
      callback(typeOld);
      return;
    }

    validateUri(typeA, function(result) {
      if (result) {
        callback(typeA);
        return;
      }

      validateUri(typeOld, function(result) {
        if (result) {
          callback(typeOld);
          return;
        }
      });
    });
  }

  function addBuilding(buildingId, wikitext, injectionIndex, csrf) {
    var newParameter = '|b=' + buildingId;
    var newWikitext = wikitext.insertAt(injectionIndex, newParameter);

    $.post({
      url: mw.util.wikiScript('api'),
      data: {
        format: 'json',
        action: 'edit',
        pageid: mw.config.values.wgArticleId,
        summary: 'Added building to BBR template',
        text: newWikitext,
        token: csrf
      },
      success: function(res) {
        window.location.reload(true);
      }
    });
  }

  String.prototype.insertAt = function(index, string) {
    return this.substr(0, index) + string + this.substr(index);
  };

  if (mw.config.values.wgCanonicalNamespace === 'File') {
    $.ajax({
      url: 'https://commons.wikimedia.org/w/api.php?action=query&prop=revisions&rvprop=content&format=json&&titles=' + mw.config.values.wgPageName,
      success: function(result) {
        // try to parse the BBR template
        var wikitext = result.query.pages[mw.config.values.wgArticleId].revisions[0]['*'];
        var reTemplate = new RegExp(/({{BBR.*?}})/g);
        var bbrTemplate = reTemplate.exec(wikitext)[0];
        var templateEnd = reTemplate.lastIndex;
        var reParams = new RegExp(/{{BBR\|(\d+)\|(\w)/g);
        var matches = reParams.exec(bbrTemplate);

        if (matches[2] == 'a' && !isNaN(matches[1])) {
          // check if the building id is already present
          var reNamedParams = new RegExp(/\|(\w+)=([^|}]+)/g);
          var matchesN = reNamedParams.exec(bbrTemplate);
          if (matchesN && (matchesN.indexOf('b') > -1 || matchesN.indexOf('byggnad') > -1)) {
            return;
          }

          // inject our HTML template
          var htmlToInject = '<p>Specifiera gärna en byggnad inom den agivna anläggningen:</p><ul id="bbr-target"></ul>';
          $('#mw-imagepage-content').prepend(htmlToInject);

          var localId = matches[1];

          getCsrfToken(function(token) {
            var csrf = token;
            // fetch relations from ksamsok-rest
            getUri(localId, function(uri) {
              $.ajax({
                url: 'https://tools.wmflabs.org/ksamsok-rest/records/' + uri + '/relations',
                success: function(result) {
                  // filter out the ones that is not a building
                  result.filter(function(relation) {
                    return relation.type == 'hasPart' ? true : false;
                  }).forEach(function(relation) {
                    // setup a HTML URI to be used by the end user
                    var re = new RegExp('\/.[^/]+(|\/)$');
                    var insertIndex = re.exec(relation.uri)['index'];
                    var htmlUrl = relation.uri.insertAt(insertIndex, '/html');
                    var buildingId = relation.uri.substr(insertIndex +1, 14);

                    // fetch the building object to access its labels
                    $.ajax({
                      url: 'https://tools.wmflabs.org/ksamsok-rest/records/' + relation.uri,
                      success: function(result) {
                        // write the buildings to our HTML template
                        var label = result.presentation.item_label ? result.presentation.item_label : result.presentation.id_label;

                        var li = document.createElement('li');
                        var a = document.createElement('a');
                        a.href = htmlUrl;
                        label = document.createTextNode(label);
                        a.appendChild(label);

                        var button = document.createElement('button');
                        var btnLabel = document.createTextNode('Välj');
                        button.appendChild(btnLabel);

                        li.appendChild(a);
                        li.appendChild(button);

                        button.addEventListener('click', function() {
                          addBuilding(buildingId, wikitext, templateEnd -2, csrf);
                        });

                        $('#bbr-target').append(li);
                      }
                    });
                  });
                }
              });
            });
          });

        }
      }
    });
  }
})(mediaWiki, jQuery);