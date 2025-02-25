/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import {Route, withRouter, type RouteComponentProps} from 'react-router-dom';
import type {RouteConfig} from 'react-router-config';
import nprogress from 'nprogress';

import clientLifecyclesDispatcher from './client-lifecycles-dispatcher';
import preload from './preload';
import normalizeLocation from './normalizeLocation';
import type {Location} from '@docusaurus/history';

import './nprogress.css';

nprogress.configure({showSpinner: false});

interface Props extends RouteComponentProps {
  readonly routes: RouteConfig[];
  readonly delay: number;
  readonly location: Location;
}
interface State {
  nextRouteHasLoaded: boolean;
}

class PendingNavigation extends React.Component<Props, State> {
  previousLocation: Location | null;
  progressBarTimeout: NodeJS.Timeout | null;

  constructor(props: Props) {
    super(props);

    // previousLocation doesn't affect rendering, hence not stored in state.
    this.previousLocation = null;
    this.progressBarTimeout = null;
    this.state = {
      nextRouteHasLoaded: true,
    };
  }

  // Intercept location update and still show current route until next route
  // is done loading.
  shouldComponentUpdate(nextProps: Props, nextState: State) {
    const routeDidChange = nextProps.location !== this.props.location;
    const {routes, delay} = this.props;

    // If `routeDidChange` is true, means the router is trying to navigate to a
    // new route. We will preload the new route.
    if (routeDidChange) {
      const nextLocation = normalizeLocation(nextProps.location);
      this.startProgressBar(delay);
      // Save the location first.
      this.previousLocation = normalizeLocation(this.props.location);
      this.setState({
        nextRouteHasLoaded: false,
      });

      // Load data while the old screen remains.
      preload(routes, nextLocation.pathname)
        .then(() => {
          clientLifecyclesDispatcher.onRouteUpdate({
            previousLocation: this.previousLocation,
            location: nextLocation,
          });
          // Route has loaded, we can reset previousLocation.
          this.previousLocation = null;
          this.setState(
            {
              nextRouteHasLoaded: true,
            },
            this.stopProgressBar,
          );
          const {hash} = nextLocation;
          if (!hash) {
            window.scrollTo(0, 0);
          } else {
            const id = decodeURIComponent(hash.substring(1));
            const element = document.getElementById(id);
            if (element) {
              element.scrollIntoView();
            }
          }
        })
        .catch((e) => console.warn(e));
      return false;
    }

    // There's a pending route transition. Don't update until it's done.
    if (!nextState.nextRouteHasLoaded) {
      return false;
    }

    // Route has loaded, we can update now.
    return true;
  }

  private clearProgressBarTimeout() {
    if (this.progressBarTimeout) {
      clearTimeout(this.progressBarTimeout);
      this.progressBarTimeout = null;
    }
  }

  private startProgressBar(delay: number) {
    this.clearProgressBarTimeout();
    this.progressBarTimeout = setTimeout(() => {
      clientLifecyclesDispatcher.onRouteUpdateDelayed({
        location: normalizeLocation(this.props.location),
      });
      nprogress.start();
    }, delay);
  }

  private stopProgressBar() {
    this.clearProgressBarTimeout();
    nprogress.done();
  }

  render() {
    const {children, location} = this.props;
    return (
      <Route location={normalizeLocation(location)} render={() => children} />
    );
  }
}

export default withRouter(PendingNavigation);
