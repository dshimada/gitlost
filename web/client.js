$(function () {
    settings = {};
    // Configure UI
    $( "button[name=rankdir]")
        .click(function () {
            settings.set('rankdir', $(this).val());
            get_graph();
        });
    $("button[name=include_forward")
        .click(function () {
            settings.set('include_forward', !$(this).hasClass('active'));
            get_graph();
        })
    // Load saved settings
    function Settings(repo_path) {
        this.repo_path = repo_path;
        this.settings = JSON.parse(localStorage.getItem(this.repo_path) || '{}');
        if (settings.include_forward === undefined) settings.include_forward = false;
    }
    Settings.prototype.set = function(key, value) {
        this.settings[key] = value;
        localStorage.setItem(this.repo_path, JSON.stringify(this.settings));
    }
    // API functions
    function update_graph(dot) {
        $("#graph").children().remove();
        d3
            .select("#graph")
            .graphviz()
            .renderDot(dot, function() {
                var $graph = $("#graph");
                $graph
                    .children('svg')
                    .height('100%')
                    .width('100%');;
                $graph
                    .find('a')
                    .each(function () {
                        var that = $(this);
                        that.data('href', that.attr('href'));
                        that.removeAttr('href');
                        that.css('cursor', 'pointer');
                    })
                    .click(function (event) {
                        event.preventDefault();
                        var that = $(this);
                        $.ajax({
                            type: "GET",
                            url: that.data('href')
                        })
                        .done(function (output) {
                            var outputArray = JSON.parse(output);
                            BootstrapDialog.show({
                                title: that.data('href').slice(5),
                                message: '<ul class="nav nav-tabs" id="tabContent"><li class="active"><a href="#details" data-toggle="tab">Details</a></li><li><a href="#status" data-toggle="tab">Status</a></li></ul>'
                                +          '<div class="tab-content">'
                                +               '<div class="tab-pane active" id="details">'
                                +                   '<br/><pre>' + outputArray[2] + '</pre>'
                                +               '</div>'
                                +               '<div class="tab-pane" id="status">'
                                +                   '<br/><pre>' + outputArray[1] + '</pre>'
                                +               '</div>'
                                +           '</div>'
                            });
                        })
                    });
            });
        // add right click menus
        var menu = new BootstrapMenu(
            'g.node', 
            {
                actions: [
                    {
                        name: 'Add Refs', 
                        onClick: function (objectname) {
                            var link_refs = $.ajax({
                                type: 'GET',
                                url: '/git/branches',
                                contentType: 'application/json'
                            })
                            .then(function (all_branches) {
                                var refs_select = $('select[name=refs]');
                                var new_branches = refs_select.val().concat(
                                    all_branches.filter(function (branch) {
                                        return branch.objectname === objectname;
                                    }).map(function (branch) {
                                        return branch.refname;
                                    })
                                );
                                refs_select.val(new_branches);
                                refs_select.selectpicker('refresh');
                                settings.set('branches', new_branches);
                                setTimeout(get_graph,1);
                            });
                        }
                    }
                ], 
                fetchElementData: function ($el) { 
                    return $el.find('title').text(); 
                }
            }
        );
    }
    $("#close").click(function (event) {
        event.preventDefault();
        $.ajax({
            type: "PUT",
            url: "/close"
        })
        .done(function (response) {
            window.close();
        });
    });
    var refs_select;    
    var refs_sortable;
    $('select[name=refs]')
        .selectpicker({actionsBox: true})
        .on('hide.bs.select', function () {
            var selected = refs_select.val();
            settings.set('branches', refs_sortable.toArray().filter(function (item) {
                return selected.indexOf(item) >= 0;
            }));
            // update after select close
            setTimeout(get_graph,1);
        });
    $('select[name=graphTypes]')
        .selectpicker()
        .on('hide.bs.select', function () {
            setTimeout(get_graph(),1);
        });
    function update_refs(refs) {
        var refs_selected = settings.settings.branches || [];
        refs_select = $('select[name=refs]');
        refs_select.find('option').remove();
        refs_selected.forEach(function (ref_short) {
            if (refs.some(function (ref) {
                return ref.ref_short === ref_short;
            })) {
                refs_select.append($('<option>' + ref_short + '</option>'));
            }
        })
        refs.forEach(function (ref) {
            if (refs_selected.indexOf(ref.ref_short) === -1) {
                refs_select.append($('<option>' + ref.ref_short + '</option>'));
            }
        });

        $.get(
            "/git/branches",
            {},
            function(data) {
                $('#branchtree').treeview({data: setTreeList(data)});
            });

        refs_select.selectpicker('refresh');
        var refs_ul = $('ul[role=listbox]');
        refs_ul.find('li').each(function (idx, item) {
            $(item).attr('data-id', $(item).find('span.text').text());
        })
        if (refs_sortable) refs_sortable.destroy();
        refs_sortable = Sortable.create(refs_ul.get(0), {
            store: {
                get: function (sortable) {
                    var sorted = refs_selected.slice(0);
                    refs.forEach(function (ref) {
                        if (sorted.indexOf(ref.ref_short) === -1) {
                            sorted.push(ref.ref_short);
                        }
                    });
                    return sorted;
                },
                set: function (sortable) {
                    var selected = refs_select.val();
                    settings.set('branches', sortable.toArray().filter(function (item) {
                        return selected.indexOf(item) >= 0;
                    }));
                }
            }
        })
        refs_select.selectpicker('val', refs_selected);
    }
    /*
     * Prevent multiple ajax requests from firing
     * Allow at most one request to queue up due to changed data
     * Fire off next request with current data
     * Shut off polling when requesting graph update
     */
    var graph_queued = false;
    var graph_promise = null;
    var polling = null;
    function get_graph() {
        if (polling !== null) {
            //polling.abort();
        }
        if (graph_promise === null) {
            // Inital request
            graph_promise = $.ajax({
                type: 'GET',
                url: '/refs',
                contentType: 'application/json'
            })
            .then(function (repo) {
                settings = new Settings(repo.repo_path);
                if (settings.settings.rankdir) {
                    $('button[name=rankdir][value=' + settings.settings.rankdir + ']').button('toggle');
                }
                if (settings.settings.include_forward) {
                    $('button[name=include_forward]').addClass('active').attr('aria-pressed', 'true');
                }
                settings.set('draw_type', $('select[name=graphTypes]').val());
                $('span.navbar-brand').text(repo.repo_path);
                update_refs(repo.refs);
                return $.ajax({
                    type: "GET",
                    url: "/dot",
                    headers: {'gitlost-settings': JSON.stringify(settings.settings)},
                    contentType: 'application/json',
                })
            })
            .then(function (dot) {
                update_graph(dot);
                if (graph_queued === false) {
                    graph_promise = null;
                    poll_git();
                }
            })
            .catch(function (err) {
                graph_promise = null;
                console.log(err);
            });
            return graph_promise;
        } else if (graph_queued === false) {
            // Queue one additional request
            graph_queued = true;
            graph_promise = graph_promise.then(function () {
                graph_queued = false;
                graph_promise = null;
                graph_promise = get_graph();
                return graph_promise;
            });
        } else {
            // Prevent multiple requests from queueing
            return graph_promise;
        }
    }
    function poll_git() {
        if (polling === null) {
            polling = $.ajax({
                type: "GET",
                url: "/watch"
            })
            .then(function (result) {
                polling = null;
                if (result.close) {
                } else if (result.heartbeat) {
                    setTimeout(poll_git, 1);
                } else {
                    console.log(result);
                    setTimeout(get_graph, 1);
                }
            })
            .catch(function (err) {
                polling = null;
                console.log(err);
            });
        }
    }
    function setTreeList(branches)
    {
        var data = [];
        var prefixes = {};

        branches.forEach(function (branch) {
            if(!branch.refname.includes("/"))
            {
                data.push({text: branch.refname}); 
            }
            else
            {
                var splitPos = branch.refname.indexOf("/");
                var prefix = branch.refname.substring(0, splitPos);
                var suffix = branch.refname.substring(splitPos + 1);
                if (!(prefix in prefixes))
                {
                    prefixes[prefix] = [{refname: suffix, objectname: branch.objectname}];
                }
                else
                {
                    prefixes[prefix].push({refname: suffix, objectname: branch.objectname});
                }
            }
        }); 

        for (var prefix in prefixes) {
            var subnodes = setTreeList(prefixes[prefix]);
            data.push({text: prefix, nodes: subnodes}); 
        }

        return data;
    }

    // startup
    get_graph();
});